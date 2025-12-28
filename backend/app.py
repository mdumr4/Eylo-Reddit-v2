import os
import json
from flask import Flask, request, jsonify
from supabase import create_client, Client
import google.generativeai as genai
from dotenv import load_dotenv
from flask_cors import CORS

# Load environment variables
load_dotenv()

# --- Configuration ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") # This should be the SERVICE ROLE key for the backend
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY, GOOGLE_API_KEY]):
    print("CRITICAL WARNING: Missing API Keys in environment variables.")

# --- Initialization ---
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-pro')

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

# --- Helper Functions ---

def verify_token(request):
    """
    Verifies the Bearer token sent in the Authorization header.
    Returns the user object if valid, None otherwise.
    """
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None

    token = auth_header.split(' ')[1]
    try:
        user = supabase.auth.get_user(token)
        return user
    except Exception as e:
        print(f"Auth Error: {e}")
        return None

def build_gemini_prompt(post_content, main_prompt):
    """Builds the structured prompt for Gemini."""
    return f"""
System Instruction:
{main_prompt}

---
Post Content to Analyze:
{post_content}
---

Your Response Format:
You must respond in a raw JSON format only, with no markdown. The JSON object must have two keys:
1. "should_message" (string: "YES" or "NO")
2. "message_body" (string: the generated message, or an empty string if "NO").
"""

# --- API Endpoints ---

@app.route('/')
def health_check():
    return jsonify({"status": "healthy", "service": "Reddit Outreach V2 Oracle"})

@app.route('/api/check-users', methods=['POST'])
def check_users():
    """
    Checks if users have already been messaged.
    Expects JSON: { "usernames": ["user1", "user2"] }
    Returns: { "new_users": ["user2"] }
    """
    # 1. Auth Check (Optional for this specific endpoint?
    #    Maybe we want the extension to check before even generating data.
    #    Let's enforce auth to prevent unauthorized scraping support)
    user_auth = verify_token(request)
    if not user_auth:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    usernames_to_check = data.get('usernames', [])
    if not usernames_to_check:
        return jsonify({"new_users": []})

    # 2. Query Supabase
    # We check the outreach_logs table to see if specific reddit_usernames exist.
    # Note: If we want to prevent ANYONE from messaging the same user twice, we check globally.
    try:
        response = supabase.table('outreach_logs') \
            .select('reddit_username') \
            .in_('reddit_username', usernames_to_check) \
            .execute()

        existing_users = {row['reddit_username'] for row in response.data}

        # Filter out existing
        new_users = [u for u in usernames_to_check if u not in existing_users]
        return jsonify({"new_users": new_users})

    except Exception as e:
        print(f"Supabase Error: {e}")
        return jsonify({"error": "Database check failed"}), 500

@app.route('/api/generate', methods=['POST'])
def generate_message():
    """
    Secure Proxy to Gemini.
    Expects JSON: { "post_content": "...", "main_prompt": "..." }
    """
    # 1. Auth Check
    user_auth = verify_token(request)
    if not user_auth:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    post_content = data.get('post_content')
    main_prompt = data.get('main_prompt')

    if not all([post_content, main_prompt]):
        return jsonify({"error": "Missing arguments"}), 400

    try:
        full_prompt = build_gemini_prompt(post_content, main_prompt)
        response = model.generate_content(full_prompt)

        # Clean up response (sometimes Gemini adds markdown ticks)
        response_text = response.text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]

        json_response = json.loads(response_text)
        return jsonify(json_response)

    except Exception as e:
        print(f"Gemini/Processing Error: {e}")
        return jsonify({"error": "AI Processing failed", "details": str(e)}), 500

@app.route('/api/log', methods=['POST'])
def log_user():
    """
    Logs a successful message.
    Expects JSON: { "reddit_username": "...", "subreddit": "..." }
    """
    user_auth = verify_token(request)
    if not user_auth:
        return jsonify({"error": "Unauthorized"}), 401

    # Supabase Auth User ID
    user_id = user_auth.user.id

    data = request.get_json()
    reddit_username = data.get('reddit_username')
    subreddit = data.get('subreddit', 'unknown')

    if not reddit_username:
        return jsonify({"error": "Missing username"}), 400

    try:
        # Use the Service Role key (backend) to perform the insert
        # We explicitly set the user_id to match the authenticated token
        result = supabase.table('outreach_logs').insert({
            "user_id": user_id,
            "reddit_username": reddit_username,
            "subreddit": subreddit,
            "status": "SENT"
        }).execute()

        return jsonify({"status": "success", "data": result.data})
    except Exception as e:
        print(f"Logging Error: {e}")
        return jsonify({"error": "Failed to log", "details": str(e)}), 500

if __name__ == '__main__':
    # In production (Render), this isn't used (Gunicorn is used instead)
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
