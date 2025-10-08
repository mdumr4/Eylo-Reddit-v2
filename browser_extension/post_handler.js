// This script is injected into individual post tabs.
// It has two jobs: scrape the post content, and later, perform UI automation to send a message.

(function() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- Part 1: Scrape post content and send it to the background script ---
    function scrapePostContent() {
        console.log("post_handler.js: Scraping post content...");
        // Updated selectors based on provided HTML
        const titleSelector = 'h1[slot="title"]';
        const contentSelector = 'div[property="schema:articleBody"]';

        const titleEl = document.querySelector(titleSelector);
        const contentEl = document.querySelector(contentSelector);

        if (titleEl && contentEl) {
            const fullPostContent = `Title: ${titleEl.textContent.trim()}\n\nBody: ${contentEl.textContent.trim()}`;
            console.log("Scraped full post content.");
            chrome.runtime.sendMessage({
                command: 'scrapedPostContent',
                data: { postContent: fullPostContent }
            });
        } else {
            console.error("Could not find post title or content elements with new selectors.");
            console.error("Title element found:", !!titleEl);
            console.error("Content element found:", !!contentEl);
            chrome.runtime.sendMessage({ command: 'scrapingError', data: { error: "Could not find post title or content elements with new selectors." } });
        }
    }

    // --- Part 2: Listen for the command to send a message ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.command === 'sendMessage') {
            console.log("Received sendMessage command.", message.data);
            performMessaging(message.data.message_body);
        }
        return true;
    });

    // --- Part 3: The UI Automation Logic ---
    async function performMessaging(messageBody) {
        console.log("Starting UI automation to send message...");
        try {
            // 1. Find the author's username link to hover over.
            const authorLink = document.querySelector('a[aria-label^="Author:"]'); // More generic selector
            if (!authorLink) throw new Error("Could not find author link to hover.");

            // 2. Simulate hover to show the profile card.
            authorLink.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            await sleep(1500); // Wait for card to appear

            // 3. Find and click the "Start Chat" button on the card.
            // This selector is highly specific and likely to change.
            const startChatButton = document.querySelector('button[aria-label*="Start chat"]');
            if (!startChatButton) throw new Error("Could not find 'Start Chat' button.");

            startChatButton.click();
            await sleep(2000); // Wait for chat modal to open

            // 4. Find the text area and type the message.
            const chatTextArea = document.querySelector('div[aria-label="Message"] > p');
            if (!chatTextArea) throw new Error("Could not find chat message text area.");

            chatTextArea.focus();
            chatTextArea.textContent = messageBody;
            // Dispatch an input event to make sure Reddit's framework recognizes the change.
            chatTextArea.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(1000);

            // 5. Find and click the final send button.
            const sendButton = document.querySelector('button[aria-label="Send Message"]');
            if (!sendButton) throw new Error("Could not find final send button.");

            sendButton.click();
            console.log("Message sent successfully!");

            // 6. Send confirmation back to the background script.
            await sleep(2000); // Wait for message to send
            chrome.runtime.sendMessage({ command: 'messageSent' });

        } catch (error) {
            console.error("Error during messaging automation:", error);
            chrome.runtime.sendMessage({ command: 'scrapingError', data: { error: error.message } });
        }
    }

    // --- Initial Action ---
    // When the script is first injected, its only job is to scrape the content.
    scrapePostContent();

})();