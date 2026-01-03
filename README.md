# Reddit Outreach Automation V2

A powerful browser extension and backend system to automate outreach on Reddit. This tool helps teams find relevant users, analyze their posts using AI, and send personalized messages.

## Features

-   **AI-Powered Filtering**: Uses OpenAI (GPT-4) to analyze posts and decide if a user is a good lead based on your custom prompt.
-   **Automated Messaging**: Navigate to profiles and start chats automatically.
-   **Team Ready**: Multi-user support with Login/Signup functionality.
-   **Centralized Logging**: Tracks all messaged users in a Supabase database to prevent double-messaging across the team.
-   **History Sync**: Scrapes existing chat history to ensure your database is up-to-date.

## Project Structure

-   `browser_extension/`: The chrome extension source code (Frontend).
-   `backend/`: The Python Flask API that handles Database logging and AI analysis.

## Setup & Installation

### 1. Prerequisites
-   Python 3.8+
-   A Supabase Project (Database & Auth)
-   An OpenAI API Key

### 2. Backend Setup
1.  Navigate to the `backend` folder:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Create a `.env` file in `backend/` with your keys:
    ```env
    SUPABASE_URL=your_supabase_url
    SUPABASE_KEY=your_service_role_key
    OPENAI_API_KEY=sk-...
    ```
4.  Run the backend:
    ```bash
    python app.py
    ```

### 3. Extension Setup
1.  Open Chrome and go to `chrome://extensions`.
2.  Enable **Developer Mode** (top right).
3.  Click **Load unpacked** and select the `browser_extension` folder.
4.  **Important**: Update `browser_extension/config.js` with your Supabase URL and Backend URL (see Deployment).

## Deployment (For Teams)

To allow your team to use this extension remotely, you must deploy the backend to a public server.
**See [DEPLOY.md](DEPLOY.md) for full deployment instructions.**

## Development

-   **Frontend**: Vanilla JS (Popup), Content Scripts (Interaction).
-   **Backend**: Flask, Supabase-py, OpenAI.

## License
[License Name]
