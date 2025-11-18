# Plan: Enhancing the Reddit Outreach Extension UX

## 1. Goal

The primary goal is to significantly improve the user experience of the browser extension. We want to move from a "black box" where the user has to check developer tools to understand what's happening, to a transparent and user-friendly interface that provides clear, real-time feedback and more robust error handling.

## 2. Proposed Features

Here is a breakdown of the features we can implement to achieve this goal.

### Feature 1: Real-time Status Log in Popup
The current status log is very basic. We will enhance it to show a detailed, step-by-step account of the automation process, such as "Scanning subreddit...", "Analyzing user 'x'...", "Sending message...", etc.

### Feature 2: Visual Progress Tracking
To give users a quick visual sense of progress, we will add:
- **A Progress Bar:** A visual bar that fills up as the extension processes users.
- **A Progress Counter:** A text element showing the number of users processed out of the total (e.g., "Processed: 7 / 12").

### Feature 3: User-Friendly Error Display
When something goes wrong, the user will be informed directly in the UI with a clear, actionable message, removing the need to open the developer console.

### Feature 4: Run Summary
After the automation is finished or stopped, the popup will display a concise summary of the session (e.g., messages sent, users skipped, users failed).

### Feature 5: Retry Failed Messages
If a message fails to send, that user will be added to a "failed" list. A "Retry Failed" button will appear in the popup, allowing the user to re-run the process only for those who were missed.

### Feature 6: Simplified Prompting Interface (New)
Based on your feedback, we will simplify the main interface by combining the separate "Prompt" and "Conditions" text areas into a single **"Main Prompt"** text area. This prompt will serve as the complete system instruction for Gemini, making the UI cleaner and more intuitive.

## 3. High-Level Implementation Plan

We can break down the implementation into the following phases:

### Phase 1: Centralized State Management & Communication
The `background.js` script will become the central "brain" for the extension's state, managing `isRunning`, `usersToProcess`, `logMessages`, `failedUsers`, and the new single `mainPrompt`. All other scripts will report their status to `background.js`.

### Phase 2: Popup UI Redesign
1.  **Update `popup.html`:**
    - Replace the two text areas for "Prompt" and "Conditions" with a single, larger text area for the "Main Prompt".
    - Add new HTML elements for the progress bar, counter, and summary section.
2.  **Refactor `popup.js`:**
    - Modify the "Start" button logic to read from the single "Main Prompt" text area.
    - Implement a function to poll `background.js` for the latest state and update the UI (log, progress bar, etc.) in real-time.
    - Add logic for the "Retry Failed" button.

### Phase 3: Backend & API Simplification
1.  **Update `app.py` (Backend):**
    - The `/generate-message` endpoint will be simplified to accept a single `main_prompt` instead of separate `conditions` and `prompt_instruction`.
    - The `build_gemini_prompt` helper function will be updated accordingly.
2.  **Update `background.js`:** The `fetch` call to the backend will be updated to send the new single `main_prompt`.

### Phase 4: Retry Logic
1.  **Modify `background.js`:**
    - When a messaging error is received, add the current user to the `failedUsers` list.
    - Modify the main `start` function to accept an optional list of users to process (for the retry functionality).
2.  **Modify `popup.js`:**
    - When the "Retry Failed" button is clicked, it will send the `start` command to `background.js`, passing the `failedUsers` list.

---

## 4. Future Enhancement Ideas (Optional)

These are more advanced features we can consider after the core plan is implemented.

- **"Dry Run" Mode:** Add a "Test Run" checkbox. When enabled, the extension would run the full analysis and log who it *would* have messaged, but wouldn't actually send any messages. This would be perfect for testing and refining a new prompt without any risk.

---

Once you review this updated plan, let me know your thoughts, and we can finalize the approach before I begin implementation.
