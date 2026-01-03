# Deploying Reddit Outreach Backend

This guide explains how to deploy the Python Flask backend to **Render.com** (a free/cheap hosting provider) so your team can use the extension anywhere.

## Prerequisites
- A **GitHub Account**.
- A **Render.com Account**.
- Your **Supabase Project URL and Key**.
- Your **OpenAI API Key**.

## Step 1: Upload Code to GitHub
1.  Initialize a git repo if you haven't (or use your existing one).
    ```bash
    git init
    git add .
    git commit -m "Backend for deployment"
    ```
2.  Push this code to a new GitHub repository (e.g., `reddit-outreach-backend`).

## Step 2: Deploy to Render
1.  Go to [Render Dashboard](https://dashboard.render.com).
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository.
4.  Configure the service:
    - **Name**: `reddit-backend` (or similar)
    - **Runtime**: Python 3
    - **Build Command**: `pip install -r backend/requirements.txt`
    - **Start Command**: `gunicorn backend.app:app`
5.  **Environment Variables**: (Scroll down to "Advanced" -> "Environment Variables")
    - Add the following keys (copy them from your `.env` file):
        - `SUPABASE_URL`: `https://your-project.supabase.co`
        - `SUPABASE_KEY`: `your-service-role-key` (Make sure it's the SERVICE ROLE key for the backend!)
        - `OPENAI_API_KEY`: `sk-...`
6.  Click **Create Web Service**.

## Step 3: Connect Extension
1.  Once deployed, Render will give you a URL (e.g., `https://reddit-backend.onrender.com`).
2.  **Update your Extension**:
    - Open `browser_extension/config.js`.
    - Change:
        ```javascript
        export const BACKEND_URL = "https://reddit-backend.onrender.com"; // Your Render URL
        ```
3.  **Distribute Extension**:
    - Zip the `browser_extension` folder.
    - Send it to your team.
    - They install it via `chrome://extensions` -> "Load Unpacked" (or you can publish to Chrome Web Store).

## Troubleshooting
- **Logs**: Check the "Logs" tab in Render if the backend isn't working.
- **CORS**: The backend is configured to allow all origins (`CORS(app)`), so it should work from any browser extension.
