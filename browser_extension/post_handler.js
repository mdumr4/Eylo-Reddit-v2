// This script is injected into individual post tabs.
// It has two jobs: scrape the post content, and later, perform UI automation to send a message.

(function() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to recursively wait for an element to appear in the DOM, including nested Shadow DOMs
    function waitForElement(selector, root = document, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                let foundElement = null;

                // Recursive search function
                function search(currentRoot) {
                    // Try to find the element in the current root
                    let element = currentRoot.querySelector(selector);
                    if (element) {
                        return element;
                    }

                    // If not found, and currentRoot has shadow DOMs, search within them
                    const shadowHosts = currentRoot.querySelectorAll('*');
                    for (const host of shadowHosts) {
                        if (host.shadowRoot) {
                            element = search(host.shadowRoot); // Recursive call
                            if (element) {
                                return element;
                            }
                        }
                    }
                    return null;
                }

                foundElement = search(root);

                if (foundElement) {
                    clearInterval(interval);
                    resolve(foundElement);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    reject(new Error(`Element "${selector}" not found within timeout in root.`));
                }
            }, 250); // Check every 250ms
        });
    }

    // --- Part 1: Scrape post content and send it to the background script ---
    function scrapePostContent() {
        console.log("post_handler.js: Scraping post content...");
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
            // 1. Extract author from the current post page
            const authorLinkOnPostPage = document.querySelector('a[aria-label^="Author:"]');
            if (!authorLinkOnPostPage) throw new Error("Could not find author link on post page.");
            const authorUsername = authorLinkOnPostPage.href.split('/').filter(Boolean).pop();
            if (!authorUsername) throw new Error("Could not extract username from author link.");

            const userProfileUrl = `https://www.reddit.com/user/${authorUsername}/`;
            console.log(`Navigating to user profile: ${userProfileUrl}`);

            // Navigate to the user's profile page
            window.location.href = userProfileUrl;

            // Wait for the profile page to load and for the chat button to appear
            const startChatButton = await waitForElement('a[data-testid="private-chat-button"]');
            console.log("Found 'Start Chat' button on user profile.");
            await sleep(Math.random() * 1000 + 500); // Human-like delay before click

            startChatButton.click();
            console.log("Clicked 'Start Chat' button.");

            // Wait for the chat modal's text area to appear (now handles nested Shadow DOMs)
            const chatTextArea = await waitForElement('textarea[name="message"]');
            console.log("Found chat message text area.");
            await sleep(Math.random() * 500 + 200); // Human-like delay before typing

            chatTextArea.focus();
            chatTextArea.value = messageBody; // Use .value for textarea
            chatTextArea.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(Math.random() * 1000 + 500); // Human-like delay after typing

            // Wait for the send button to appear (now handles nested Shadow DOMs)
            const sendButton = await waitForElement('button[aria-label="Send message"]');
            console.log("Found final send button.");
            await sleep(Math.random() * 500 + 200); // Human-like delay before click

            sendButton.click();
            console.log("Message sent successfully!");

            await sleep(Math.random() * 2000 + 1000); // Human-like delay after sending
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