# AGENTS.md - Repository Architecture & Development Guidelines

This repository implements **Reddit Outreach Automation V2**, a dual-tier system consisting of a Manifest V3 Chrome Extension frontend and a Python Flask API backend integrated with Supabase and OpenAI.

All agents modifying this codebase must adhere strictly to these architectural boundaries and guidelines:

---

## 1. Directory Placement & Architectural Boundaries

- **Frontend Chrome Extension (rowser_extension/)**:
  - manifest.json: Chrome Manifest V3 specification.
  - ackground.js: Service worker managing extension lifecycle and tab messaging.
  - popup.html & popup.js: User interface for authentication, prompt entry, real-time activity logging, and execution control.
  - content_script.js: Injected script listening for background worker commands.
  - src/agent.js: Core automation engine implementing human-like stealth DOM interactions (smooth scrolling, randomized bounding-box jitter, organic mouse events, React-safe human typing simulation).
  - src/auth.js: Client-side authentication managing Supabase session tokens.
  - src/chat_history_scraper.js: Scrapes existing Reddit DM conversations to synchronize past outreach with Supabase.
  - src/inspector.js: DOM inspection and prospect post parsing.
  - src/supabase_client.js: Direct Supabase client for client-side event queries.
  - images/: Extension icons (16px, 48px, 128px).

- **Backend REST API (ackend/)**:
  - pp.py: Flask service exposing endpoints for Bearer token verification, Supabase deduplication checks, OpenAI GPT-4o-mini qualification proxy, and outreach audit logging.
  - supabase_schema.sql: Authoritative database schema for outreach_logs with unique constraints on (user_id, reddit_username).
  - 
equirements.txt: Python package dependencies.
  - .env.example: Configuration template for required environment variables.

- **Assets & Documentation (ssets/ & docs/)**:
  - ssets/: Houses UI screenshots, demo recordings, and diagram assets referenced in documentation.
  - docs/: Houses architectural presentations (.pdf, .pptx), deployment manuals, and user guides.

---

## 2. Security & Credential Invariants (CRITICAL)

- **Zero Secret Leaks**: Never commit .env or rowser_extension/config.js containing active credentials to Git.
- **Service Role Key Isolation**: SUPABASE_KEY (service role) must **only** reside in the backend environment. The browser extension must only use the public non key.
- **Token Verification**: All backend endpoints (/api/check-users, /api/generate, /api/log, /api/log-bulk) must enforce erify_token(request) using the user's Supabase Bearer token.

---

## 3. Automation Stealth & Anti-Bot Invariants

- When modifying src/agent.js, preserve all humanized stealth mechanics:
  - Coordinate jitter (
andomPoint(-2, 2)) on click targets.
  - Smooth scrolling before interacting with elements.
  - Dispatching full mouse event chains (mouseover -> mousedown -> mouseup -> click).
  - Realistic randomized pause intervals between queue items (minimum 5-8 seconds) to prevent Reddit rate limiting or automated account suspension.

---

## 4. Verification & Testing

- Before completing any frontend modification, test extension loading via Chrome Developer Mode (chrome://extensions/ -> Load Unpacked).
- Before completing any backend modification, test Flask endpoints using local requests (python app.py) or health check verification.
