// inspector.js v3 - Shadow DOM Piercer
(function () {
    console.log("🕵️ Inspector v3 Loaded. Shadow DOM Scan Mode.");

    function getAllElementsInTree(root) {
        let elements = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
        while (walker.nextNode()) {
            const el = walker.currentNode;
            elements.push(el);
            if (el.shadowRoot) {
                elements = elements.concat(getAllElementsInTree(el.shadowRoot));
            }
        }
        return elements;
    }

    function scan() {
        console.log("--- DEEP SCANNING ---");
        const allEls = getAllElementsInTree(document.body);
        console.log(`Scanned ${allEls.length} elements across Shadow DOMs.`);

        // 1. Find Links
        const links = allEls.filter(el => el.tagName === 'A');
        console.log(`Found ${links.length} links.`);

        // 2. Filter for Chat-like links
        // Common patterns: /room/, /user/, or just text content matching a username
        const chatLinks = links.filter(a => {
            const href = a.getAttribute('href') || "";
            return href.includes('/room/') || href.includes('/user/');
        });

        console.log(`Found ${chatLinks.length} potential chat links.`);

        if (chatLinks.length > 0) {
            const sample = chatLinks[0];
            console.log("✅ SAMPLE LINK:", sample);
            console.log("Href:", sample.getAttribute('href'));
            console.log("Text:", sample.innerText);

            // Find Scroll Container
            let p = sample.parentElement;
            while (p) {
                // Check if p is a shadow root or element
                if (p.nodeType === Node.ELEMENT_NODE) {
                    const style = window.getComputedStyle(p);
                    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                        console.log("✅ FOUND SCROLL CONTAINER:", p);
                        console.log("Classes:", p.className);
                        alert(`Inspector FOUND it! Container Class: ${p.className}`);
                        return true;
                    }
                }
                // Move up. If we hit shadow root, go to host
                if (p.parentNode instanceof ShadowRoot) {
                    p = p.parentNode.host;
                } else {
                    p = p.parentElement;
                }
            }
        } else {
            // Backup: Look for "Threads" text to orient ourselves
            const threadsHeader = allEls.find(el => el.innerText && el.innerText.trim() === 'Threads');
            if (threadsHeader) {
                console.log("Found 'Threads' header:", threadsHeader);
            }
        }
        return false;
    }

    const interval = setInterval(() => {
        if (scan()) clearInterval(interval);
    }, 3000);

    setTimeout(() => { clearInterval(interval); console.log("Timeout"); }, 30000);

})();
