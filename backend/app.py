
import os
import json
from flask import Flask, request, jsonify
from google.cloud import firestore
import google.generativeai as genai
from dotenv import load_dotenv
from flask_cors import CORS

# Load environment variables from .env file
load_dotenv()

# --- Initialization ---
db = firestore.Client()
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-pro') 
app = Flask(__name__)
CORS(app)

# --- Helper Functions ---

def build_gemini_prompt(post_content, main_prompt):
    """Builds the structured prompt for the Gemini API."""
    return f"""
System Instruction:
{main_prompt}

---
Post Content to Analyze:
{post_content}
---

Your Response Format:
You must respond in a raw JSON format only, with no markdown. The JSON object should have two keys: "should_message" (string: "YES" or "NO") and "message_body" (string: the generated message, or an empty string if "should_message" is "NO").
"""

# --- API Endpoints ---

@app.route('/')
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/check-users', methods=['POST'])
def check_users():
    """
    Receives a list of usernames and checks which ones are NOT in the 
    'messaged_users' collection in Firestore.
    """
    data = request.get_json()
    usernames_to_check = data.get('usernames', [])
    if not usernames_to_check:
        return jsonify({"new_users": []})

    users_ref = db.collection('messaged_users')
    all_existing_users = set()
    
    # Firestore 'in' operator has a limit of 30 values. Batch the queries.
    for i in range(0, len(usernames_to_check), 30):
        batch = usernames_to_check[i:i + 30]
        query = users_ref.where('__name__', 'in', batch)
        for result in query.stream():
            all_existing_users.add(result.id)
    
    new_users = [user for user in usernames_to_check if user not in all_existing_users]
    return jsonify({"new_users": new_users})

@app.route('/generate-message', methods=['POST'])
def generate_message():
    """
    Receives post data and a main prompt, calls the Gemini API, 
    and returns its structured JSON response.
    """
    data = request.get_json()
    post_content = data.get('post_content')
    main_prompt = data.get('main_prompt')

    if not all([post_content, main_prompt]):
        return jsonify({"status": "error", "message": "Missing 'post_content' or 'main_prompt'"}), 400

    try:
        full_prompt = build_gemini_prompt(post_content, main_prompt)
        
        response = model.generate_content(full_prompt)
        
        response_text = response.text.strip().replace("```json", "").replace("```", "")
        
        json_response = json.loads(response_text)

        print(f"Gemini response: {json_response}")
        return jsonify(json_response)

    except Exception as e:
        print(f"Error calling Gemini API or parsing response: {e}")
        # Return a structured error that the frontend can display
        return jsonify({
            "status": "error", 
            "message": "Failed to process request with Gemini API.", 
            "user_message": "The AI messaging service failed. This could be due to a network issue or a problem with the API. Please check the backend console for details.",
            "details": str(e)
        }), 500

@app.route('/log-user', methods=['POST'])
def log_user():
    data = request.get_json()
    username = data.get('username')
    if not username:
        return jsonify({"status": "error", "message": "Username not provided"}), 400
    try:
        db.collection('messaged_users').document(username).set({})
        return jsonify({"status": "success", "logged_user": username})
    except Exception as e:
        print(f"Error logging user {username}: {e}")
        return jsonify({"status": "error", "message": "Failed to log user to database.", "details": str(e)}), 500

# --- Main Entry Point ---

if __name__ == '__main__':
    app.run(debug=True, port=5000)
