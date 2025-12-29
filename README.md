# Reddit Outreach Automation V2 🤖

This project is an automated outreach tool for Reddit, consisting of a **Chrome Browser Extension** (for navigating and interacting with Reddit) and a **Python Flask Backend** (for AI generation and database logging).

## 📂 Project Structure

- `browser_extension/`: The Chrome Extension source code.
- `backend/`: The Python Flask API and database schemas.

---

## ✅ Prerequisites

1.  **Python 3.8+** installed.
2.  **Google Chrome** browser.
3.  A **Supabase** account (Free tier is fine).
4.  A **Google Gemini API Key** (for AI generation).

---

## 🛠️ Backend Setup

The backend handles AI message generation and logs outreach history to Supabase.

1.  **Navigate to the backend folder**:
    ```bash
    cd backend
    ```

2.  **Create and Activate a Virtual Environment** (Recommended):
    ```bash
    python -m venv venv
    # Windows:
    .\venv\Scripts\activate
    # Mac/Linux:
    source venv/bin/activate
    ```

3.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Set up Environment Variables**:
    Create a `.env` file in the `backend/` directory:
    ```ini
    SUPABASE_URL="your_supabase_url"
    SUPABASE_KEY="your_supabase_service_role_key"
    GOOGLE_API_KEY="your_gemini_api_key"
    ```

5.  **Run the Server**:
    ```bash
    python app.py
    ```
    *The server runs on `http://127.0.0.1:5000`*

6.  **Database Setup (Supabase)**:
    - Go to your Supabase SQL Editor.
    - Run the contents of `backend/supabase_schema.sql` to create the `outreach_logs` table.

---

## 🧩 Browser Extension Setup

1.  Open Chrome and go to `chrome://extensions`.
2.  Enable **Developer Mode** (top right toggle).
3.  Click **Load Unpacked**.
4.  Select the `browser_extension` folder from this project.

---

## 🚀 Usage Guide

1.  **Start the Backend**: Make sure `python app.py` is running in your terminal.
2.  **Open Reddit**: Go to a subreddit (e.g., `r/freelanceForHire` or `r/test`).
3.  **Open Extension**: Click the robot icon in your Chrome toolbar.
4.  **Login**: Enter any email/password (Dummy login for now, or match your Supabase Auth user if enforced).
5.  **Config**: Enter a "Main Prompt" (e.g., "Find users looking for web dev work").
6.  **Start**: Click **Start Automation**.
    - The bot will find users, open their profiles, generate a message using the Backend, type it, and send it.
    - **Note**: Currently running in **Mock Mode** (generates "Helloo") to save API credits.

---

## 🐛 Troubleshooting

-   **"Failed to fetch"**: Ensure the backend is running (`python app.py`).
-   **Old Icons?**: If you see old icons, reload the extension or clear Chrome cache.
-   **Logging Issues**: Check the backend terminal for `DEBUG: Insert Result`. If empty, check your Supabase RLS policies.
