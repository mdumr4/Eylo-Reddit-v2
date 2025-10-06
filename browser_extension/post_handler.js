(function() {
    console.log("post_handler.js running...");

    // Selectors for the post title and body content.
    // These are based on Reddit's current structure and may need updating.
    const titleSelector = 'h1[data-testid="post-title"]';
    const contentSelector = 'div[data-testid="post-content"]';

    const titleEl = document.querySelector(titleSelector);
    const contentEl = document.querySelector(contentSelector);

    if (titleEl && contentEl) {
        const title = titleEl.textContent.trim();
        const content = contentEl.textContent.trim();
        
        const fullPostContent = `Title: ${title}

Body: ${content}`;

        console.log("Scraped full post content.");

        // Send the scraped content back to the background script.
        chrome.runtime.sendMessage({
            command: 'scrapedPostContent',
            data: {
                postContent: fullPostContent
            }
        });

    } else {
        console.error("Could not find post title or content elements. The selectors may be outdated.");
        // Send an error message back to the background script
        chrome.runtime.sendMessage({
            command: 'scrapingError',
            data: {
                error: "Could not find post title or content elements."
            }
        });
    }
})();
