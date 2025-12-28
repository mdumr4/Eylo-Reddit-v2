// agent.js - Combined Scraper and Chatter with Stealth

(function () {
    console.log("🤖 Agent Loaded: " + window.location.href);

    // --- Stealth Functions ---
    const randomPoint = (min, max) => Math.random() * (max - min) + min;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function humanClick(element) {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(randomPoint(300, 500));

        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2 + randomPoint(-5, 5);
        const y = rect.top + rect.height / 2 + randomPoint(-5, 5);

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
        // Clear logic for textarea if needed
        element.value = "";

        for (const char of text) {
            await sleep(randomPoint(30, 80));
            element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));

            // Standard generic input
            const start = element.selectionStart;
            const end = element.selectionEnd;
            const val = element.value;
            element.value = val.substring(0, start) + char + val.substring(end);
            element.selectionStart = element.selectionEnd = start + 1;

            element.dispatchEvent(new InputEvent('input', { data: char, bubbles: true, inputType: 'insertText' }));
            element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        }
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
            setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout: ${selector}`)); }, timeout);
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
                data: { postContent: `Title: ${title}\nBody: ${body}` }
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
            const authorLink = await waitForElement('a[href^="/user/"], a[href^="/u/"]');
            const href = authorLink.getAttribute('href');
            // Send back to background to handle the navigation (reliable)
            chrome.runtime.sendMessage({ command: 'agentRequestNavigation', data: { url: `https://www.reddit.com${href}` } });
        } catch (e) {
            chrome.runtime.sendMessage({ command: 'messagingError', data: { error: e.message + " (Finding Author)" } });
        }
    }

    async function sendChatMessage(messageBody) {
        try {
            console.log("Looking for Chat button...");
            // Heuristic for Chat Button
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const startChatBtn = buttons.find(b => {
                const t = b.textContent.toLowerCase();
                return t.includes('chat') && !t.includes('settings') && !t.includes('general');
            });

            if (!startChatBtn) {
                // Try looking for the icon specific test id
                const iconBtn = document.querySelector('a[data-testid="private-chat-button"]');
                if (iconBtn) {
                    await humanClick(iconBtn);
                } else {
                    throw new Error("Chat button not found");
                }
            } else {
                await humanClick(startChatBtn);
            }

            console.log("Waiting for Chat Input...");
            const input = await waitForElement('[contenteditable="true"], textarea');

            await humanType(input, messageBody);
            await sleep(1000);

            // Find Send Button (icon usually)
            const sendBtn = document.querySelector('button[aria-label="Send"]');
            if (sendBtn) {
                await humanClick(sendBtn);
                await sleep(2000);
                chrome.runtime.sendMessage({ command: 'messageSent' });
            } else {
                throw new Error("Send button not found");
            }

        } catch (e) {
            chrome.runtime.sendMessage({ command: 'messagingError', data: { error: e.message } });
        }
    }

    // --- Controller ---

    // If we were just injected, what should we do?
    // We check the URL context.

    if (document.querySelector('shreddit-post') || window.location.pathname.includes('/comments/')) {
        scrape();
    } else if (window.location.pathname.includes('/user/') || window.location.pathname.includes('/u/')) {
        // Do nothing, wait for 'doChat' command
    }

    // --- Message Listener ---
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
        if (msg.command === 'navigateProfile') navigateToProfile();
        if (msg.command === 'doChat') sendChatMessage(msg.data.messageBody);
    });

})();
