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

            // Wait for the send button to appear (it might act as the "Send Invite" button initially)
            const inviteSendButton = await waitForElement('button[aria-label="Send message"]');
            console.log("Found initial invite send button.");

            // --- NEW: Click the send button to send the initial invite ---
            console.log("Clicking send button to send initial invite message.");
            inviteSendButton.click();
            await sleep(Math.random() * 1000 + 500); // Human-like delay after clicking invite

            // Wait for the chat text area to appear
            const chatTextArea = await waitForElement('textarea[placeholder*="Message"], div[contenteditable="true"]');
            console.log("Found chat text area.");

            // --- NEW: Wait for the chatTextArea to become ENABLED ---
            console.log("Waiting for chat text area to become enabled...");
            let textareaEnabled = false;
            let attempts = 0;
            while (!textareaEnabled && attempts < 50) { // Try up to 50 times (10 seconds)
                await sleep(200); // Check every 200ms
                if (chatTextArea.tagName === 'TEXTAREA') {
                    if (!chatTextArea.disabled) {
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

            chatTextArea.focus();

            // Robust message injection loop (into the now enabled textarea)
            let messageInjected = false;
            for (let i = 0; i < 10; i++) { // Try up to 10 times
                chatTextArea.value = messageBody;
                chatTextArea.dispatchEvent(new Event('input', { bubbles: true }));
                chatTextArea.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(200); // Short delay to allow Reddit's UI to process
                if (chatTextArea.value === messageBody) {
                    messageInjected = true;
                    break;
                }
            }

            if (!messageInjected) {
                throw new Error("Failed to inject message into chat text area after multiple attempts.");
            }

            await sleep(Math.random() * 1000 + 500); // Human-like delay after typing

            // Wait for the send button to appear (now handles nested Shadow DOMs)
            const finalSendButton = await waitForElement('button[aria-label="Send message"]');
            console.log("Found final send button."); // Log again for clarity
            await sleep(Math.random() * 3000 + 1500); // Human-like delay before click and after message injection

            finalSendButton.click();
            console.log("Message sent successfully!");

            await sleep(Math.random() * 5000 + 3000); // Increased delay after sending
            chrome.runtime.sendMessage({ command: 'messageSent' });
            // --- END NEW ---

        } catch (error) {
            console.error("Error during messaging automation:", error);
            chrome.runtime.sendMessage({ command: 'scrapingError', data: { error: error.message } });
        }
    }

    // --- Initial Action ---
    // When the script is first injected, its only job is to scrape the content.
    scrapePostContent();

})();