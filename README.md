# Reddit Outreach Automation V2

A powerful Chrome extension and Python backend suite designed to automate and personalize Reddit outreach. This tool scrapes relevant posts, leverages GPT-4 to identify high-quality prospects based on a custom persona, and automates the DM process while ensuring no duplicate messaging across your team.

## 🚀 Features

- 🎯 **AI Filtering**: Uses GPT-4 to analyze Reddit posts and filter users that match your specific target persona.
- 🤖 **Automated Navigation**: Content scripts handle the heavy lifting of navigating to user profiles and initiating DMs.
- 💾 **Supabase Integration**: A centralized database tracks all outreach events to prevent double-messaging.
- 👥 **Team Ready**: Designed for deployment across multiple team members with a shared backend.
- ⚡ **Manifest V3**: Built on the latest Chrome extension standards for performance and security.
- 🛠️ **Customizable Persona**: Easily update the AI's selection criteria via backend prompts.

## 🏗️ Architecture

```text
+-----------------------+       +-------------------+       +-------------------+
|   Chrome Extension    | <---> |   Flask Backend   | <---> |   OpenAI GPT-4    |
| (JS, Content Scripts) |       |   (Python, API)   |       | Persona Filtering)|
+-----------------------+       +-------------------+       +-------------------+
            ^                            |
            |                            v
            +--------------+-------------+
                           |
                           |
                      [ Supabase DB ]
                 (Outreach Logs & Auth)
```

## 📋 Prerequisites

Before you begin, ensure you have the following:

- **Python 3.8+** installed on your system.
- **Google Chrome** browser.
- **OpenAI API Key** (for GPT-4 processing).
- **Supabase Account** (for database and authentication).
- **Render/Heroku/Railway Account** (optional, for public backend hosting).

## 🛠️ Installation

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows
   .\venv\Scripts\activate
   # macOS/Linux
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables:
   - Create a `.env` file in the `backend/` folder.
   - Copy the values from `.env.example`.
   - ⚠️ **SECURITY:** Never commit your `.env` file to version control.

5. Start the backend:
   ```bash
   python app.py
   ```

### 2. Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked** and select the `browser_extension` folder.
4. Configure the extension:
   - Copy `browser_extension/config.example.js` to `browser_extension/config.js`.
   - Open `browser_extension/config.js` and update the constants with your Supabase and Backend URLs.

## ⚙️ Configuration Reference

### Backend (`.env`)

| Variable | Description |
| :--- | :--- |
| `OPENAI_API_KEY` | Your OpenAI secret key (requires GPT-4 access). |
| `SUPABASE_URL` | The API URL provided in your Supabase project settings. |
| `SUPABASE_KEY` | Your Supabase **service_role** key (required for DB bypass). |

### Extension (`config.js`)

| Constant | Description |
| :--- | :--- |
| `SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_ANON_KEY` | Your Supabase **anon/public** key. |
| `BACKEND_URL` | The URL where your Flask backend is hosted (local or public). |

## 📖 Usage Guide

1. **Start the Backend**: Ensure your Flask server is running and accessible.
2. **Open Reddit**: Navigate to a subreddit relevant to your niche.
3. **Run Scraper**: Click the extension icon and use the popup to start scanning posts.
4. **AI Selection**: The extension sends post data to the backend. GPT-4 evaluates the users.
5. **Automated DM**: Validated users are queued. The extension will automatically open their profiles and initiate the DM sequence.
6. **Logging**: Once a DM is sent, the event is logged to Supabase to prevent future duplicates.

## 🌐 Team Deployment

To use this tool with a team, the backend must be accessible publicly:

1. **Host the Backend**: Deploy the `backend/` folder to a service like **Render** or **Railway**.
2. **Set Environment Variables**: Add your `.env` keys to the hosting provider's dashboard.
3. **Update Extension**: Update `BACKEND_URL` in `browser_extension/config.js` to point to your public URL.
4. **Distribute**: Share the extension folder with your team. They can load it and log in via the Supabase Auth integration.

## 🗄️ Supabase Schema

The project uses a simple but effective schema to manage outreach:

### Table: `outreach_logs`
Used to track which Reddit users have already been contacted.

| Column | Type | Purpose |
| :--- | :--- | :--- |
| `id` | UUID | Primary key for the log entry. |
| `user_id` | UUID | Reference to the team member who sent the message. |
| `reddit_username` | TEXT | The username of the contacted Reddit user. |

---

> [!WARNING]
> **Gitignore Reminder:** Ensure the `venv/` folder and `.env` files are included in your `.gitignore` to prevent leaking credentials and unnecessary files.
