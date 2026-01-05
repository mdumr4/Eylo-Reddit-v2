// agent.js - Combined Scraper and Chatter with Stealth

(function () {
    console.log("🤖 Agent Loaded v5.6 (Listener Fix): " + window.location.href);

    // --- Stealth Functions ---
    const randomPoint = (min, max) => Math.random() * (max - min) + min;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function humanClick(element) {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(randomPoint(300, 500));

        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2 + randomPoint(-2, 2);
        const y = rect.top + rect.height / 2 + randomPoint(-2, 2);

        const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
        element.dispatchEvent(new MouseEvent('mouseover', opts));
        await sleep(randomPoint(50, 100));
        element.dispatchEvent(new MouseEvent('mousedown', { ...opts, buttons: 1 }));
        await sleep(randomPoint(50, 100));
        element.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 1 }));
        element.dispatchEvent(new MouseEvent('click', opts));
    }

    async function humanType(element, text) {
        element.focus();

        // Helper: React-safe value setter
        const setNativeValue = (el, value) => {
            const proto = Object.getPrototypeOf(el);
            const valueProp = Object.getOwnPropertyDescriptor(proto, 'value');
            if (valueProp && valueProp.set) {
                valueProp.set.call(el, value);
            } else {
                el.value = value;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
        };

        // Instant "paste" logic
        setNativeValue(element, text);

        // Ensure UI updates
        element.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200); // Brief pause for React to sync
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const obs = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) { obs.disconnect(); resolve(el); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout: ${selector}`)); }, timeout);
        });
    }

    // --- Actions ---

    function scrape() {
        const title = document.querySelector('h1')?.textContent.trim();
        const body = document.querySelector('div[id*="post-content"]')?.textContent.trim()
            || document.querySelector('div[property="schema:articleBody"]')?.textContent.trim()
            || "";

        if (title) {
            chrome.runtime.sendMessage({
                command: 'postScraped',
                data: { postContent: `Title: ${title}\nBody: ${body}` }
            });
        } else {
            console.log("Could not find post title immediately.");
            chrome.runtime.sendMessage({
                command: 'messagingError',
                data: { error: "Could not find post title or content." }
            });
        }
    }

    async function navigateToProfile() {
        try {
            console.log("Agent: Finding Author Link...");
            const authorLink = await waitForElement('a[href^="/user/"], a[href^="/u/"], span[itemprop="author"] a, shreddit-post a[href^="/user/"]');

            if (authorLink) {
                const url = authorLink.href;
                console.log(`Agent: Found Author URL: ${url}. Requesting Navigation...`);
                chrome.runtime.sendMessage({ command: 'agentRequestNavigation', data: { url: url } });
            } else {
                throw new Error("Author link not found");
            }

        } catch (e) {
            chrome.runtime.sendMessage({ command: 'messagingError', data: { error: e.message + " (Finding Author)" } });
        }
    }

    // --- Helper: Deep Shadow Search (Global) ---
    const findInShadows = (selector, root = document.body) => {
        let el = root.querySelector(selector);
        if (el) return el;
        const elements = root.querySelectorAll('*');
        for (const elem of elements) {
            if (elem.shadowRoot) {
                el = findInShadows(selector, elem.shadowRoot);
                if (el) return el;
            }
        }
        return null;
    };

    // NEW: Helper for check if element is editable
    function isEditable(el) {
        if (!el) return false;
        return el.tagName === 'TEXTAREA' ||
            el.tagName === 'INPUT' ||
            el.getAttribute('contenteditable') === 'true' ||
            el.getAttribute('role') === 'textbox';
    }

    async function sendChatMessage(messageBody) {
        try {
            console.log("🔍 Looking for Chat button...");

            // Specific selector for Reddit profile chat button
            const chatSelector = 'a[href*="chat.reddit.com/user/"], shreddit-async-loader[bundlename="chat_button_profile"], button[aria-label="Start Chat"], button[aria-label="Message"]';
            let startChatBtn = null;

            // Loop for 5 seconds to find a VISIBLE button
            const startTime = Date.now();
            while (Date.now() - startTime < 5000) {
                const elements = document.querySelectorAll(chatSelector);
                // Find first visible one
                startChatBtn = Array.from(elements).find(el => el.offsetParent !== null);

                if (startChatBtn) break;
                await sleep(500);
            }

            if (!startChatBtn) {
                console.warn("⚠️ Chat button not found or hidden (Privacy Settings?). Skipping.");
                chrome.runtime.sendMessage({ command: 'workflowSkip' });
                return;
            }

            console.log("✅ Found Chat button");
            await humanClick(startChatBtn);
            await sleep(3500); // Increased wait for modal

            // --- 1. Robust Input Finding (Shadow DOM Compatible) ---
            console.log("🔍 Looking for message input (Deep Search)...");



            const getSelectors = () => [
                'textarea[aria-label="Write message"]',
                'textarea[placeholder="Message"]',
                'div[contenteditable="true"][role="textbox"]',
                'faceplate-textarea-input textarea',
                'shreddit-composer textarea'
            ];

            let input = null;
            let retries = 0;

            while (!input && retries < 5) {
                // Try global search first
                for (const sel of getSelectors()) {
                    input = document.querySelector(sel);
                    if (input) break;
                }

                // Try Shadow DOM search logic if global failed
                if (!input) {
                    for (const sel of getSelectors()) {
                        input = findInShadows(sel);
                        if (input) break;
                    }
                }

                // Fallback: Check for ANY visible textarea if specific ones fail
                if (!input) {
                    const allTextareas = Array.from(document.querySelectorAll('textarea'));
                    input = allTextareas.find(t => t.offsetParent !== null && t.clientHeight > 0);
                }

                if (!input) {
                    await sleep(1000);
                    retries++;
                }
            }

            if (!input) {
                if (isEditable(document.activeElement)) {
                    input = document.activeElement;
                    console.log("⚠️ Used activeElement fallback:", input.tagName, input.className);
                } else {
                    console.error("❌ Debug: Input search failed (v5.3).");
                    throw new Error("Could not find chat input even with Deep Search. Check console.");
                }
            }

            console.log("✅ Found input:", input.tagName);

            // --- 2. Polish Typing (Single Attempt, React Clean) ---
            input.focus();
            input.click();
            await humanType(input, messageBody);
            await sleep(500);

            // Verification (Single Check)
            const currentVal = input.value || input.textContent;
            if (currentVal.trim() !== messageBody.trim()) {
                console.warn(`⚠️ Text mismatch. Expected: "${messageBody}", Got: "${currentVal}". Correcting...`);
                input.value = messageBody;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(500);
            }

            // --- 3. Send Button Logic (Enter Key Preferred for Speed) ---
            console.log("🔍 Looking for Send button...");

            const findSendResult = () => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(b => {
                    const label = (b.getAttribute('aria-label') || "").toLowerCase();
                    const type = (b.getAttribute('type') || "").toLowerCase();

                    if (label === 'send message') return true;
                    if (label.includes('send') && !label.includes('upload')) return true;
                    if (b.querySelector('svg path[d^="M2.01"]') || b.innerHTML.includes('path')) {
                        return !label.includes('menu') && !label.includes('overflow');
                    }
                    return false;
                });
            };

            let sendBtn = findSendResult();

            // Wait brief moment for enable
            let k = 0;
            while ((!sendBtn || sendBtn.disabled) && k < 5) {
                input.dispatchEvent(new Event('input', { bubbles: true })); // Pulse
                await sleep(500);
                sendBtn = findSendResult();
                k++;
            }

            const isMessageSent = () => {
                const val = input.value || input.textContent;
                return val.trim() === "";
            };

            // --- Helper: Success Validator (Polls for Errors) ---
            const validateSuccess = async (methodName) => {
                console.log(`✅ Message sent successfully (${methodName})!`);
                console.log("⏳ Validating send (polling for 10s for potential error toasts)...");

                // Helper to check for error banner text
                const checkErrorBanner = () => {
                    const errorPhrases = ["Let's take a break", "lot of invites", "lot of chats"];

                    // 1. Efficient Check: Look for top-level alerts banner directly
                    let alertBanner = document.querySelector('rs-alerts-banner');

                    if (alertBanner && alertBanner.shadowRoot) {
                        const faceplate = alertBanner.shadowRoot.querySelector('faceplate-banner');
                        if (faceplate) {
                            const msg = faceplate.getAttribute('msg') || faceplate.innerText || "";
                            if (errorPhrases.some(phrase => msg.includes(phrase))) return true;
                        }
                    }

                    // 2. Fallback: Deep Search (Only if necessary)
                    try {
                        const banner = findInShadows('faceplate-banner[appearance="error"]');
                        if (banner) {
                            const msg = banner.getAttribute('msg') || banner.innerText || "";
                            if (errorPhrases.some(phrase => msg.includes(phrase))) return true;
                        }
                    } catch (e) {
                        console.warn("Deep search extraction error:", e);
                    }

                    return false;
                };

                // Polling Loop (5 seconds)
                for (let i = 1; i <= 10; i++) {
                    await sleep(500);
                    if (i % 2 === 0) console.log(`⏳ Checking for errors... (${i / 2}s / 5s)`);

                    if (checkErrorBanner()) {
                        console.error("🛑 Rate Limit Detected during validation.");
                        throw new Error("Rate Limit Exceeded");
                    }
                }

                console.log("✅ Validation passed. No errors found.");
                chrome.runtime.sendMessage({ command: 'messageSent' });
            };

            // Attempt 1: Enter Key (User Preferred)
            console.log("🚀 Attempt 1: Using Enter key...");
            input.focus();
            input.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                bubbles: true, cancelable: true
            }));
            await sleep(1500);

            if (isMessageSent()) {
                await validateSuccess("Enter Key");
                return;
            }

            // Final hail mary: Force click
            if (sendBtn) {
                sendBtn.click();
                await sleep(1000);
                if (isMessageSent()) {
                    await validateSuccess("Force Click");
                    return;
                }
            }

            throw new Error("❌ Failed to send message. Input field did not clear.");

        } catch (error) {
            console.error("❌ Error:", error.message);

            // 1. Immediate Check: Did validation already catch it?
            if (error.message.includes("Rate Limit Exceeded")) {
                chrome.runtime.sendMessage({
                    command: 'messagingError',
                    data: { error: "Rate Limit Exceeded" }
                });
                return;
            }

            // 2. Final Safety Check (Double Verify)
            // (Only runs if error was something else, like "Input not cleared")
            const errorPhrases = ["Let's take a break", "lot of invites", "lot of chats"];
            let rateLimitFound = false;

            try {
                // Check findInShadows
                const banner = findInShadows('faceplate-banner[appearance="error"]');
                if (banner) {
                    const msg = banner.getAttribute('msg') || banner.innerText || "";
                    if (errorPhrases.some(phrase => msg.includes(phrase))) rateLimitFound = true;
                }

                if (!rateLimitFound) {
                    const alerts = document.querySelector('rs-alerts-banner');
                    if (alerts && alerts.shadowRoot) {
                        const innerBanner = alerts.shadowRoot.querySelector('faceplate-banner');
                        if (innerBanner) {
                            const msg = innerBanner.getAttribute('msg') || innerBanner.innerText || "";
                            if (errorPhrases.some(phrase => msg.includes(phrase))) rateLimitFound = true;
                        }
                    }
                }
            } catch (e) {
                console.warn("Safety check failed:", e);
            }

            if (rateLimitFound) {
                chrome.runtime.sendMessage({
                    command: 'messagingError',
                    data: { error: "Rate Limit Exceeded" }
                });
                return;
            }

            // Generic Error
            chrome.runtime.sendMessage({
                command: 'messagingError',
                data: { error: error.message }
            });
        }
    }

    // --- Message Listener (RESTORED) ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.command === 'scrape') {
            scrape();
        } else if (message.command === 'navigateProfile') {
            navigateToProfile();
        } else if (message.command === 'doChat') {
            sendChatMessage(message.data.messageBody);
        }
    });

})();
