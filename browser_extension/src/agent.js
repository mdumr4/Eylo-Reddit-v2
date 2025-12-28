```javascript
// agent.js - Combined Scraper and Chatter with Stealth

(function () {
    console.log("🤖 Agent Loaded v5.3 (Polished): " + window.location.href);

    // --- Stealth Functions ---
    const randomPoint = (min, max) => Math.random() * (max - min) + min;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function humanClick(element) {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(randomPoint(300, 500));

        const rect = element.getBoundingClientRect();
        // Slightly tighter click radius to avoid missing small buttons
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
            // Vital for React to see the change
            el.dispatchEvent(new Event('input', { bubbles: true }));
        };

        // 1. Clear
        setNativeValue(element, "");

        // 2. Type cleanly (No keydown/keypress to avoid double chars)
        for (const char of text) {
            await sleep(randomPoint(20, 50));
            const val = element.value;
            setNativeValue(element, val + char);
        }

        // Finalize
        element.dispatchEvent(new Event('change', { bubbles: true }));
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
            setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout: ${ selector } `)); }, timeout);
        });
    }

    // --- Actions ---

    function scrape() {
        // Try multiple selectors for Post Body
        const title = document.querySelector('h1')?.textContent.trim();
        const body = document.querySelector('div[id*="post-content"]')?.textContent.trim()
            || document.querySelector('div[property="schema:articleBody"]')?.textContent.trim()
            || "";

        if (title) {
            chrome.runtime.sendMessage({
                command: 'postScraped',
                data: { postContent: `Title: ${ title } \nBody: ${ body } ` }
            });
        } else {
            // Might need to wait for load?
            console.log("Could not find post title immediately.");
            // Optional: Retrying logic here or just fail
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

            console.log("Agent: Clicking Author Link (Stealth)...");
            await humanClick(authorLink);

            console.log("Agent: Clicked. Signaling Background to wait for load...");
            // Signal background that we clicked and it should expect a load
            chrome.runtime.sendMessage({ command: 'agentRequestNavigation', data: { url: 'clicked' } });

        } catch (e) {
            chrome.runtime.sendMessage({ command: 'messagingError', data: { error: e.message + " (Finding Author)" } });
        }
    }

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
            const startChatBtn =
                document.querySelector('a[href*="chat.reddit.com/user/"]') ||
                document.querySelector('[aria-label*="chat"]') ||
                document.querySelector('button[aria-label*="chat"]');

            if (!startChatBtn) throw new Error("Start Chat button not found");

            console.log("✅ Found Chat button");
            await humanClick(startChatBtn);
            await sleep(3500); // Increased wait for modal

            // --- 1. Robust Input Finding (Shadow DOM Compatible) ---
            console.log("🔍 Looking for message input (Deep Search)...");

            // Helper to recursively search shadow DOMs
            const findInShadows = (selector, root = document.body) => {
                // Check root first
                let el = root.querySelector(selector);
                if (el) return el;

                // Recursively check all children with shadowRoots
                const elements = root.querySelectorAll('*');
                for (const elem of elements) {
                    if (elem.shadowRoot) {
                        el = findInShadows(selector, elem.shadowRoot);
                        if (el) return el;
                    }
                }
                return null;
            };

            const getSelectors = () => [
                'textarea[aria-label="Write message"]',
                'textarea[placeholder="Message"]',
                'div[contenteditable="true"][role="textbox"]',
                'faceplate-textarea-input textarea', // Common Reddit component
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
                        if (input) {
                            console.log(`✅ Found input in Shadow DOM via: ${ sel } `);
                            break;
                        }
                    }
                }

                // Fallback: Check for ANY visible textarea if specific ones fail
                if (!input) {
                    const allTextareas = Array.from(document.querySelectorAll('textarea'));
                    input = allTextareas.find(t => t.offsetParent !== null && t.clientHeight > 0);
                    if (input) console.log("⚠️ Fallback: Found a generic visible textarea.");
                }

                if (!input) {
                    await sleep(1000);
                    retries++;
                }
            }

            if (!input) {
                // Fallback: activeElement check if it looks like an input
                if (isEditable(document.activeElement)) {
                    input = document.activeElement;
                    console.log("⚠️ Used activeElement fallback:", input.tagName, input.className);
                } else {
                    // DIAGNOSTIC LOGGING
                    console.error("❌ Debug: Input search failed (v5.3).");
                    throw new Error("Could not find chat input even with Deep Search. Check console.");
                }
            }

            console.log("✅ Found input:", input.tagName);

            // --- 2. Polish Typing (Single Attempt, React Clean) ---
            input.focus();
            input.click(); // Ensure focus
            await humanType(input, messageBody);
            await sleep(500);

            // Verification (Single Check)
            const currentVal = input.value || input.textContent;
            if (currentVal.trim() !== messageBody.trim()) {
                 console.warn(`⚠️ Text mismatch.Expected: "${messageBody}", Got: "${currentVal}".Correcting...`);
                 // Force set if mismatch
                 const proto = Object.getPrototypeOf(input);
                 const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                 if (setter) {
                     setter.call(input, messageBody);
                 } else {
                     input.value = messageBody;
                 }
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
                    // Paper plane icon check
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
                console.log("⏳ Waiting for send button to enable...");
                input.dispatchEvent(new Event('input', { bubbles: true })); // Pulse the input
                await sleep(500);
                sendBtn = findSendResult();
                k++;
            }

            const isMessageSent = () => {
                const val = input.value || input.textContent;
                return val.trim() === "";
            };

            // Attempt 1: Human Click
            if (sendBtn && !sendBtn.disabled) {
                console.log("✅ Attempt 1: Clicking Send button (Human)...");
                await humanClick(sendBtn);
                await sleep(1500);
            }

            // Fast Verify & Fallback
            if (isMessageSent()) {
                console.log("✅ Message sent successfully!");
                chrome.runtime.sendMessage({ command: 'messageSent' });
                return;
            }

                console.log("✅ Message sent (native click)!");
                chrome.runtime.sendMessage({ command: 'messageSent' });
                return;
            }

            // Attempt 3: Enter Key
            console.warn("⚠️ Attempt 3: Using Enter key fallback...");
            input.focus();
            input.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                bubbles: true, cancelable: true
            }));
            await sleep(1500);

            // Verify 3 (Final)
            if (isMessageSent()) {
                console.log("✅ Message sent (Enter key)!");
                chrome.runtime.sendMessage({ command: 'messageSent' });
            } else {
                throw new Error("❌ Failed to send message. Input field did not clear.");
            }

        } catch (error) {
            console.error("❌ Error:", error.message);
            chrome.runtime.sendMessage({
                command: 'messagingError',
                data: { error: error.message }
            });
        }
    }

    // --- Controller ---

    // Prioritize URL checking to avoid "Scraping on Profile" loop
    const currentPath = window.location.pathname;

    if (currentPath.includes('/user/') || currentPath.includes('/u/')) {
        console.log("Agent: On Profile Page. Waiting for 'doChat' command...");
        // Do nothing, just listen.
    } else if (currentPath.includes('/comments/') || document.querySelector('shreddit-post')) {
        console.log("Agent: On Post Page. Scraping...");
        scrape();
    }

    // --- Message Listener ---
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
        if (msg.command === 'navigateProfile') navigateToProfile();
        if (msg.command === 'doChat') sendChatMessage(msg.data.messageBody);
    });

})();
