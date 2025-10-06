
import os
import json
from flask import Flask, request, jsonify
from google.cloud import firestore
import google.generativeai as genai

# --- Initialization ---

# Initialize Firestore Client
# Assumes GOOGLE_APPLICATION_CREDENTIALS environment variable is set.
db = firestore.Client()

# Configure Gemini API
# Assumes GOOGLE_API_KEY environment variable is set.
# Make sure to get your key from Google AI Studio and set the environment variable.
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-pro')

# Create the Flask application instance
app = Flask(__name__)

# --- Helper Functions ---

def build_gemini_prompt(post_content, conditions, prompt_instruction):
    """Builds the structured prompt for the Gemini API."""
    return f"""
System Prompt:
You are an intelligent Reddit outreach assistant. Your task is to decide if a message should be sent based on a set of rules, and if so, to generate the message.

Rules (Conditions):
{conditions}

Post Content:
{post_content}

Message Generation Instruction:
{prompt_instruction}

Your Response Format:
You must respond in a raw JSON format only, with no markdown. The JSON object should have two keys: "should_message" (string: "YES" or "NO") and "message_body" (string: the generated message, or an empty string if "should_message" is "NO").
"""

# --- API Endpoints ---

@app.route('/')
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/check-users', methods=['POST'])
def check_users():
    data = request.get_json()
    usernames_to_check = data.get('usernames', [])
    if not usernames_to_check:
        return jsonify({"new_users": []})
    
    # Firestore's 'in' operator is limited to 30 items per query.
    # For a more robust solution, we would batch the requests.
    # This is sufficient for our initial version.
    users_ref = db.collection('messaged_users')
    query = users_ref.where('__name__', 'in', usernames_to_check)
    results = query.stream()
    existing_users = {result.id for result in results}
    
    new_users = [user for user in usernames_to_check if user not in existing_users]
    print(f"Checked {len(usernames_to_check)} users. Found {len(new_users)} new users.")
    return jsonify({"new_users": new_users})

@app.route('/generate-message', methods=['POST'])
def generate_message():
    """
    Receives post data, conditions, and a prompt instruction.
    Calls the Gemini API and returns its structured JSON response.
    """
    data = request.get_json()
    post_content = data.get('post_content')
    conditions = data.get('conditions')
    prompt_instruction = data.get('prompt_instruction')

    if not all([post_content, conditions, prompt_instruction]):
        return jsonify({"status": "error", "message": "Missing required data"}), 400

    try:
        full_prompt = build_gemini_prompt(post_content, conditions, prompt_instruction)
        
        # Call the Gemini API
        response = model.generate_content(full_prompt)
        
        # Clean up and parse the JSON response from the model
        # A simple cleanup for "```json\n{...}\n```" format
        response_text = response.text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        json_response = json.loads(response_text)

        print(f"Gemini response: {json_response}")
        return jsonify(json_response)

    except Exception as e:
        print(f"Error calling Gemini API or parsing response: {e}")
        # It's good practice to return a structured error
        return jsonify({"status": "error", "message": "Failed to process request with Gemini API.", "details": str(e)}), 500

@app.route('/log-user', methods=['POST'])
def log_user():
    data = request.get_json()
    username = data.get('username')
    if not username:
        return jsonify({"status": "error", "message": "Username not provided"}), 400
    try:
        users_ref = db.collection('messaged_users')
        users_ref.document(username).set({})
        print(f"Successfully logged user: {username}")
        return jsonify({"status": "success", "logged_user": username})
    except Exception as e:
        print(f"Error logging user {username}: {e}")
        return jsonify({"status": "error", "message": "Failed to log user to database.", "details": str(e)}), 500

# --- Main Entry Point ---

if __name__ == '__main__':
    # Note: For production, use a proper WSGI server like Gunicorn instead of app.run()
    app.run(debug=True, port=5000)
