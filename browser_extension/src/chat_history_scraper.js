// src/chat_history_scraper.js

(function () {
    console.log("📜 Chat History Scraper v1.4 - Stability Tuning");

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    const randomPoint = (min, max) => Math.random() * (max - min) + min;

    // Helper: Find all elements including Shadow DOM
    function getAllElementsInTree(root) {
        if (!root) return [];
        let elements = [];
        if (root.children) {
            for (let child of root.children) {
                elements.push(child);
                if (child.shadowRoot) {
                    elements = elements.concat(getAllElementsInTree(child.shadowRoot));
                }
                elements = elements.concat(getAllElementsInTree(child));
            }
        }
        return elements;
    }

    // Helper: Find valid usernames in text
    function extractUsernames(root) {
        let found = [];
        const walk = (node) => {
            if (node.shadowRoot) walk(node.shadowRoot);
            if (node.nodeType === Node.TEXT_NODE) {
                const txt = (node.textContent || "").trim();
                // Basic length check for Reddit usernames (3-20 chars usually)
                if (txt.length >= 3 && txt.length <= 25) {
                    // Regex: alphanumeric, underscore, dash
                    if (/^[a-zA-Z0-9_-]+$/.test(txt)) {
                        // Filter explicit noise list
                        const noise = ["Threads", "Chats", "Message Requests", "Mentions", "Legacy Chat", "Directs",
                            "Rooms", "Requests", "Reddit", "Explore", "Mod", "Settings",
                            "Apply", "Unread", "Yesterday", "Today", "Now"];
                        if (!noise.includes(txt) &&
                            !txt.match(/:[0-9]{2}/) && // Time (2:30)
                            !txt.match(/^[0-9]+[mhdy]$/) && // Time relative (2m, 1h)
                            !txt.match(/^[A-Z][a-z]{2} [0-9]{1,2}$/) // Date (Oct 12)
                        ) {
                            found.push(txt);
                        }
                    }
                }
            } else {
                if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
                    node.childNodes.forEach(walk);
                }
            }
        };
        walk(root);
        return found;
    }

    async function scrapeChatHistory() {
        console.log("🕵️ Looking for chat sidebar...");
        let mainNav = null;

        // 1. Find Main Nav Component
        for (let i = 0; i < 15; i++) {
            const allEls = getAllElementsInTree(document.body);
            // 'RS-ROOMS-NAV' is the custom element for the sidebar
            mainNav = allEls.find(el => el.tagName === 'RS-ROOMS-NAV');
            if (mainNav) break;
            await sleep(1000);
        }

        if (!mainNav) {
            console.error("❌ Could not find <rs-rooms-nav>.");
            // Notify user of failure
            chrome.runtime.sendMessage({ command: 'messagingError', data: { error: "Chat list not found (v1.3)." } });
            return;
        }

        console.log("✅ Found Main Nav:", mainNav);

        // 2. Find the ACTUAL scrollable container inside
        let scrollTarget = null;
        const searchRoot = mainNav.shadowRoot ? mainNav.shadowRoot : mainNav;

        const candidates = getAllElementsInTree(searchRoot);
        // Sort by scrollHeight descending to find the biggest container
        candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);

        console.log(`🔎 Found ${candidates.length} inner elements. Checking for scroll capability...`);

        for (const el of candidates) {
            const style = window.getComputedStyle(el);
            // Must behave scroll height > client height to be scrollable
            // And usually main chat list is quite tall (> 300px) or at least significant
            const isOverflowing = el.scrollHeight > el.clientHeight;
            const hasScrollStyle = (style.overflowY === 'auto' || style.overflowY === 'scroll');

            if (isOverflowing && hasScrollStyle && el.clientHeight > 100) {
                console.log("🎯 Found Scroll Target:", el.tagName, `ScrollH:${el.scrollHeight} ClientH:${el.clientHeight} Class:${el.className}`);
                scrollTarget = el;
                break;
            }
        }

        if (!scrollTarget) {
            console.warn("⚠️ No inner scrollable found (or none overflowing). Falling back to Main Nav.");
            // Check if mainNav itself is scrollable
            if (mainNav.scrollHeight > mainNav.clientHeight) {
                scrollTarget = mainNav;
                console.log("🎯 Using Main Nav as scroll target.");
            } else {
                console.warn("⚠️ Main Nav is also not overflowing. This might be a short list or an error.");
                scrollTarget = mainNav; // Fallback anyway
            }
        }

        // 3. Scroll Loop
        let seenUsers = new Set();
        let unchangedCount = 0;
        let keepScrolling = true;

        console.log("🏁 Starting Scroll Loop (v1.4 - Stability Tuning)...");

        while (keepScrolling) {
            // A. Scrape
            const prevSize = seenUsers.size;
            const users = extractUsernames(searchRoot);
            users.forEach(u => seenUsers.add(u));
            const newSize = seenUsers.size;

            if (newSize > prevSize) {
                console.log(`✨ Found ${newSize - prevSize} new users (Total: ${newSize})`);
                unchangedCount = 0; // Reset stuck counter if we are finding new people
            } else {
                console.log(`📡 No new users this step. Total: ${newSize}`);
            }

            // B. Scroll Logic
            const prevTop = scrollTarget.scrollTop;
            const maxScrollHeight = scrollTarget.scrollHeight;
            const clientHeight = scrollTarget.clientHeight;

            // 1. Scroll Down (Smaller steps for virtual lists)
            const scrollAmount = randomPoint(250, 450);
            scrollTarget.scrollBy({ top: scrollAmount, behavior: 'smooth' });

            // 2. Wait for Load (Key for lazy loading)
            // Wait slightly longer to ensure virtual list renders
            await sleep(randomPoint(2000, 3000));

            const newTop = scrollTarget.scrollTop;

            // Check progress
            if (Math.abs(newTop - prevTop) < 5) {
                // We didn't move. Why?
                const isAtBottom = (Math.abs((maxScrollHeight - clientHeight) - newTop) < 50);

                if (isAtBottom) {
                    console.log(`⚠️ At bottom? Unchanged: ${unchangedCount}/10`);
                    unchangedCount++;

                    // RETRY / WIGGLE LOGIC
                    // Progressive Backoff: Wait longer as we fail more
                    if (unchangedCount > 5) await sleep(2000);

                    if (unchangedCount % 2 === 0) {
                        console.log("🐛 Wiggling (Scroll Up/Down) to trigger load...");
                        scrollTarget.scrollBy({ top: -200, behavior: 'auto' });
                        await sleep(1000);
                        scrollTarget.scrollBy({ top: 200, behavior: 'auto' });
                        await sleep(2000);
                    }

                    if (unchangedCount > 10) {
                        console.log("🏁 Definitively reached bottom (10 attempts).");
                        keepScrolling = false;
                    }
                } else {
                    // Stuck in middle?
                    console.log("⚠️ Stuck in middle. Forcing jump.");
                    scrollTarget.scrollBy({ top: 100, behavior: 'auto' });
                    unchangedCount++;
                    if (unchangedCount > 10) keepScrolling = false; // Safety break
                }
            } else {
                // We moved!
                // Don't fully reset unchangedCount here if we didn't find users?
                // No, let's reset it only if we found users OR moved significantly.
                // Actually, if we moved, we are making progress.
                // But if we move and find NO users for 20 steps, we should probably stop?
                // For now, let's keep it simple: Movement = Good.
                if (unchangedCount > 0) console.log("✅ Recovered movement.");
                unchangedCount = 0;
            }
        }

        // 4. Submit
        const distinctUsers = Array.from(seenUsers);
        console.log(`✅ Scrape Complete. Submitting ${distinctUsers.length} users.`);

        chrome.runtime.sendMessage({
            command: 'chatHistoryScraped',
            data: { usernames: distinctUsers }
        });
    }

    scrapeChatHistory();

})();
