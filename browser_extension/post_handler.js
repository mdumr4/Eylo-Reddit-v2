// This script is injected into individual post tabs.
// It has two jobs: scrape the post content, and later, perform UI automation to send a message.

(async function() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to recursively wait for an element to appear in the DOM
    function waitForElement(selector, root = document, timeout = 15000) {
        // ... (implementation remains the same)
    }

    // --- Part 1: Scrape post content ---
    function scrapePostContent() {
        const titleSelector = 'h1[slot="title"]';
        const contentSelector = 'div[property="schema:articleBody"]';
        const titleEl = document.querySelector(titleSelector);
        const contentEl = document.querySelector(contentSelector);

        if (titleEl && contentEl) {
            const fullPostContent = `Title: ${titleEl.textContent.trim()}\n\nBody: ${contentEl.textContent.trim()}`;
            chrome.runtime.sendMessage({
                command: 'postScraped', // More specific command
                data: { postContent: fullPostContent }
            });
        } else {
            chrome.runtime.sendMessage({ 
                command: 'messagingError', // Use the new error command
                data: { error: "Could not find post title or content elements." } 
            });
        }
    }

    // --- Part 2: Listen for the command to send a message ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.command === 'sendMessage') {
            performMessaging(message.data.message_body)
                .then(() => sendResponse({ status: "success" }))
                .catch(err => sendResponse({ status: "error", message: err.message }));
        }
        return true; // Keep channel open for async response
    });

    // --- Part 3: The UI Automation Logic ---
    async function performMessaging(messageBody) {
        try {
            const authorLink = await waitForElement('a[aria-label^="Author:"]');
            const authorUsername = authorLink.href.split('/').filter(Boolean).pop();
            if (!authorUsername) throw new Error("Could not extract username from author link.");

            window.location.href = `https://www.reddit.com/user/${authorUsername}/`;

            const startChatButton = await waitForElement('a[data-testid="private-chat-button"]');
            await sleep(Math.random() * 1000 + 500);
            startChatButton.click();

            await sleep(2000); // Wait for chat panel

            const chatTextArea = await waitForElement('textarea[aria-label="Write message"], input[aria-label="Write message"]');
            
            // Wait for textarea to be enabled
            let attempts = 0;
            while (chatTextArea.disabled && attempts < 50) {
                await sleep(200);
                attempts++;
            }
            if (chatTextArea.disabled) throw new Error("Chat text area did not become enabled.");

            chatTextArea.focus();
            await sleep(300);

            // Inject message robustly
            chatTextArea.value = messageBody;
            chatTextArea.dispatchEvent(new Event('input', { bubbles: true }));
            
            await sleep(500);
            if (chatTextArea.value !== messageBody) {
                 throw new Error("Failed to inject message into chat text area.");
            }

            const sendButton = await waitForElement('button[aria-label="Send message"]');
            
            // Wait for send button to be enabled
            attempts = 0;
            while (sendButton.disabled && attempts < 30) {
                await sleep(200);
                attempts++;
            }
            if (sendButton.disabled) console.warn("Send button did not become enabled, attempting click anyway.");

            await sleep(Math.random() * 1000 + 500);
            sendButton.click();

            await sleep(2000); // Wait after sending
            chrome.runtime.sendMessage({ command: 'messageSent' });

        } catch (error) {
            // Send a specific error message back to the background script
            chrome.runtime.sendMessage({ command: 'messagingError', data: { error: error.message } });
        }
    }

    // --- Initial Action ---
    scrapePostContent();

})();