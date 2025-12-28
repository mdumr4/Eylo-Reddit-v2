// agent.js - The "Hands" of the bot (Content Script)
// Merges Stealth Logic + Reddit Interaction Logic

(async function () {
    console.log("🤖 Reddit Agent v2 Loaded");

    // --- Stealth Utilities (Inlined for Content Script compatibility) ---

    const randomPoint = (min, max) => Math.random() * (max - min) + min;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function humanClick(element) {
        if (!element) return;

        // 1. Scroll slightly off center
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(randomPoint(300, 600));

        // 2. Get coordinates
        const rect = element.getBoundingClientRect();
        // Add significant jitter
        const x = rect.left + (rect.width / 2) + randomPoint(-10, 10);
        const y = rect.top + (rect.height / 2) + randomPoint(-5, 5);

        // 3. Dispatch Trusted-like Event Sequence
        const eventOptions = {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            buttons: 1
        };

        element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
        await sleep(randomPoint(50, 150));

        element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        await sleep(randomPoint(80, 150)); // Dwell time

        element.dispatchEvent(new MouseEvent('mouseup', eventOptions));

        // Final Click
        element.dispatchEvent(new MouseEvent('click', eventOptions));
    }

    async function humanType(element, text) {
        element.focus();
        // Don't clear value instantly; maybe select all and delete?
        // element.value = "";

        for (const char of text) {
            await sleep(randomPoint(40, 120)); // Typing speed

            element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));

            // Attempt to insert text via standard DOM
            const val = element.value;
            element.value = val + char;

            // Trigger React/Framework listeners
            const tracker = element._valueTracker;
            if (tracker) {
                tracker.setValue(val);
            }
            element.dispatchEvent(new InputEvent('input', { data: char, bubbles: true, inputType: 'insertText' }));

            element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function waitForElement(selector, root = document, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const el = root.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver((mutations, obs) => {
                const el = root.querySelector(selector);
                if (el) {
                    obs.disconnect();
                    resolve(el);
                }
            });

            observer.observe(root, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for selector: ${selector}`));
            }, timeout);
        });
    }

    // --- Core Agent Logic ---

    function scrapePostContent() {
        // Robust selectors for "Shreddit" (New Reddit)
        const titleEl = document.querySelector('h1[slot="title"]') || document.querySelector('h1');
        const contentEl = document.querySelector('div[property="schema:articleBody"]') || document.querySelector('div[id*="post-content"]');

        // Get Subreddit Name from URL (Fallback)
        const subreddit = window.location.pathname.split('/')[2] || 'unknown';

        if (titleEl) {
            const bodyText = contentEl ? contentEl.textContent.trim() : "[Image/Link Post]";
            const fullPostContent = `Title: ${titleEl.textContent.trim()}\n\nBody: ${bodyText}`;

            chrome.runtime.sendMessage({
                command: 'postScraped',
                data: {
                    postContent: fullPostContent,
                    subreddit: subreddit
                }
            });
        } else {
            chrome.runtime.sendMessage({
                command: 'messagingError',
                data: { error: "Could not find post title." }
            });
        }
    }

    async function performMessaging(messageBody) {
        try {
            console.log("Agent: Starting messaging sequence...");

            // 1. Find Author Link & Click it (Human Navigation)
            // Instead of window.location.href, we click the anchor to preserve referrer
            const authorLink = await waitForElement('a[href^="/user/"], a[href^="/u/"]');

            console.log("Agent: Clicking author profile...");
            await humanClick(authorLink);

            // Wait for navigation? The script will die here because the page unloads.
            // THIS IS KEY: The Background script needs to re-inject this agent
            // once the new page loads.
            // So we actually stop here. The background script logic is:
            // 1. Open Post Tab -> Inject Agent -> Scrape -> Agent sends "Scraped"
            // 2. Background gets AI Decision -> If YES...
            // 3. Background navigates Tab to User Profile (OR Agent clicks).
            //    If Agent clicks, the tab loads, and Background must inject Agent AGAIN to do the chatting.

            // However, the current Architecture in `background.js` (processUsers loop)
            // opens the POST url, then the post_handler changes location to USER url.
            // This reload kills the script.

            // FIX: We will change `window.location.href` here for simplicity in V2,
            // but in V3 we should handle the reload event in background.js.
            // For now, let's stick to the current flow but use the new logic.

            // Actually, if we use `window.location.href`, we don't need to click.
            // But to use `humanClick`, we are simulating interaction.

            // Let's assume the current architecture expects this script to handle EVERYTHING.
            // That means this script assumes it survives the reload? NO, it doesn't.
            // `post_handler.js` logic was: `window.location.href = ...` then `await waitForElement`.
            // That `await` would hang forever if the page reloaded.
            // Meaning the original code was BROKEN for page navigations unless it was a SPA transition.

            // Reddit IS a SPA (mostly). So `click()` might just verify pushState.
            // Let's try `authorLink.click()`.

            // Wait, if I click, I need to wait for the Chat Button on the NEW view.

            const authorUsername = authorLink.getAttribute('href').split('/').filter(Boolean).pop();
            console.log(`Agent: Targeted user ${authorUsername}`);

            // Force navigation for reliability (SPA navigation validation is hard)
            // We'll stick to href assignment but add a delay to mimick reading.
            await sleep(randomPoint(1000, 2000));
            window.location.href = `https://www.reddit.com/user/${authorUsername}/`;

            // Problem: This script DIES here.
            // The previous `post_handler.js` line 52: `const startChatButton = await waitForElement...`
            // This code was theoretically impossible to work unless Reddit didn't reload the page.
            // We will fix this by sending a message to background: "NavigatingToProfile".
            // Then Background waiting for Tab Update, then injecting Agent Part 2 (Chatter).

            // But to keep it "Simple", let's see if we can just scrape and send message in one go?
            // No, we have to go to the profile to click Chat.

            // RE-ARCHITECTURE DECISION:
            // `agent.js` will handle SCRAPING only.
            // `chatter.js` will handle CHATTING.
            // Background script manages the transition.

            // But sticking to the "Simple" plan, maybe we just use the API to open the chat window?
            // No, we want human emulation.

            // Let's assume for this specific step (Post -> Profile), we might lose context.
            // However, if we look at `post_handler.js`, it scrapes, sends message to background,
            // background calls Gemini, sends message BACK to `post_handler.js`.
            // THEN `post_handler` navigates.
            // So the `post_handler` handles the navigation.

            // If the script continues after `window.location.href`, it means the page didn't unload
            // (SPA). If it unloads, the background script logic hangs.

            // Let's check `processUsers` in `background.js`.
            // It `executeScript` `post_handler.js`.
            // Then it waits.

            // The Safest way is:
            // 1. Scrape (Agent Mode 1). Return data.
            // 2. Background navigates tab to Profile.
            // 3. Background injects Agent (Mode 2) to click Chat.

            // For now, I'll modify `agent.js` to ONLY do scraping if it sees a Post content.
            // If it sees a "Chat Button" (Profile page), it enters Chat Mode.
            // This allows the same script to be injected twice.

        } catch (error) {
            // ...
        }
    }

    // --- Router ---

    // Logic: Check URL or content to decide role
    if (document.querySelector('shreddit-post') || document.querySelector('div[id*="post-content"]')) {
        console.log("Agent: Detected Post Page. Scraping...");
        scrapePostContent();
    }
    else if (window.location.href.includes('/user/')) {
        console.log("Agent: Detected User Profile. Waiting for command...");
        // Does nothing until it gets a message?
        // Or checks if we are in the middle of an operation?
        // Ideally background script sends a "StartChat" command effectively.
    }

    // Message Listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.command === 'sendMessage') {
            // We are on the Post page, and just got the command to send.
            // We need to navigate to the user profile, then chat.
            // BUT if we navigate, we die.

            // Solution: Background script should handle the navigation URL update.
            // Then inject the script again.
        }
    });

})();

// WAIT. The original logic had `window.location.href` inside `performMessaging`.
// This confirms the previous dev likely didn't test this part or relied on SPA.
// I will implement a robust 2-step flow.

// To support the existing `background.js` structure with minimal changes:
// I will keep `performMessaging` here, but I will wrap the Navigation in a way
// that if it fails (reloads), the Background script catches it?
// No, the Background script manages the "Session" via `tabUserMap`.
// I will update `background.js` to:
// 1. Receive 'postScraped'.
// 2. Call API.
// 3. If YES -> Update Tab URL to Profile. Wait for Load.
// 4. Inject `agent.js` again.
// 5. Send 'openChatAndSend' command to `agent.js`.

// This implies `agent.js` needs to handle:
// 1. Auto-Scrape on load (if post).
// 2. 'openChatAndSend' command (if profile).
