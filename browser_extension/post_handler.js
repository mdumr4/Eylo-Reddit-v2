// This script is injected into individual post tabs.
// It has two jobs: scrape the post content, and later, perform UI automation to send a message.

(function() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to recursively wait for an element to appear in the DOM, including nested Shadow DOMs
    function waitForElement(selector, root = document, timeout = 15000, matchFunction = null) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                let foundElement = null;

                // Recursive search function
                function search(currentRoot) {
                    // Try to find the element in the current root
                    let elements = currentRoot.querySelectorAll(selector);
                    if (matchFunction) {
                        for (const el of elements) {
                            if (matchFunction(el)) {
                                return el;
                            }
                        }
                    } else if (elements.length > 0) {
                        return elements[0]; // Return the first element if no matchFunction
                    }

                    // If not found, and currentRoot has shadow DOMs, search within them
                    const shadowHosts = currentRoot.querySelectorAll('*');
                    for (const host of shadowHosts) {
                        if (host.shadowRoot) {
                            let shadowElement = search(host.shadowRoot); // Recursive call
                            if (shadowElement) {
                                return shadowElement;
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

            // *** CRITICAL FIX 1: Use the correct accessible name ***
            // The chat text area has accessible name "Write message" not a placeholder
            // Also need to wait longer for the chat panel to fully load
            await sleep(2000); // Give chat panel time to open

            // *** CRITICAL FIX 2: Search by aria-label instead of placeholder ***
            const chatTextArea = await waitForElement(
                'textarea[aria-label="Write message"], input[aria-label="Write message"]',
                document,
                15000
            );
            console.log("Found chat text area with accessible name 'Write message'.");

            // *** CRITICAL FIX 3: Check if textarea is enabled ***
            console.log("Waiting for chat text area to become enabled...");
            let textareaEnabled = false;
            let attempts = 0;
            while (!textareaEnabled && attempts < 50) { // Try up to 50 times (10 seconds)
                await sleep(200); // Check every 200ms

                // Check if it's a textarea or input
                if (chatTextArea.tagName === 'TEXTAREA' || chatTextArea.tagName === 'INPUT') {
                    if (!chatTextArea.disabled && !chatTextArea.readOnly) {
                        textareaEnabled = true;
                    }
                } else if (chatTextArea.tagName === 'DIV') {
                    if (chatTextArea.contentEditable === 'true') {
                        textareaEnabled = true;
                    }
                }
                attempts++;
            }

            if (!textareaEnabled) {
                throw new Error("Chat text area did not become enabled within timeout.");
            }
            console.log("Chat text area is now enabled. Proceeding with message injection.");
            await sleep(Math.random() * 500 + 200); // Human-like delay after chat is ready

            // *** CRITICAL FIX 4: Focus and inject message properly ***
            chatTextArea.focus();
            await sleep(300); // Wait for focus to take effect

            // Robust message injection loop
            let messageInjected = false;
            for (let i = 0; i < 10; i++) { // Try up to 10 times
                // Clear existing value first
                chatTextArea.value = '';
                await sleep(100);

                // Set new value
                chatTextArea.value = messageBody;

                // Trigger multiple events to ensure Reddit detects the change
                chatTextArea.dispatchEvent(new Event('input', { bubbles: true }));
                chatTextArea.dispatchEvent(new Event('change', { bubbles: true }));
                chatTextArea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

                await sleep(300); // Wait for Reddit's UI to process

                if (chatTextArea.value === messageBody) {
                    messageInjected = true;
                    console.log("Message successfully injected into text area.");
                    break;
                }
                console.log(`Injection attempt ${i + 1} failed, retrying...`);
            }

            if (!messageInjected) {
                throw new Error("Failed to inject message into chat text area after multiple attempts.");
            }

            await sleep(Math.random() * 1000 + 500); // Human-like delay after typing

            // *** CRITICAL FIX 5: Wait for send button to become enabled ***
            console.log("Looking for send button...");
            const sendButton = await waitForElement(
                'button[aria-label="Send message"]',
                document,
                15000
            );
            console.log("Found send button.");

            // Wait for send button to be enabled (it's disabled when textarea is empty)
            let sendButtonEnabled = false;
            attempts = 0;
            while (!sendButtonEnabled && attempts < 30) {
                await sleep(200);
                if (!sendButton.disabled && !sendButton.hasAttribute('disabled')) {
                    sendButtonEnabled = true;
                }
                attempts++;
            }

            if (!sendButtonEnabled) {
                console.warn("Send button did not become enabled, attempting to click anyway...");
            } else {
                console.log("Send button is enabled.");
            }

            await sleep(Math.random() * 1000 + 500); // Human-like delay before clicking send

            sendButton.click();
            console.log("Clicked send button. Message sent successfully!");

            await sleep(Math.random() * 3000 + 2000); // Wait after sending
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