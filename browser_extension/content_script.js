(function() {
    console.log("Content script running for enhanced scraping...");

    // This selector targets the container of an entire post.
    const postContainerSelector = '[data-testid="post-container"]';
    
    const postContainers = document.querySelectorAll(postContainerSelector);
    
    const scrapedData = [];

    postContainers.forEach(container => {
        // Find the author and post link *within* each container.
        const authorEl = container.querySelector('a[data-testid="post-author-name"]');
        // This selector targets the post title link.
        const postLinkEl = container.querySelector('a[data-testid="post-title"]');

        if (authorEl && postLinkEl) {
            const author = authorEl.textContent.trim();
            const postUrl = postLinkEl.href;
            
            // Ensure we have both before adding.
            if (author && postUrl) {
                scrapedData.push({ author, postUrl });
            }
        }
    });

    console.log(`Scraped ${scrapedData.length} posts:`, scrapedData);

    // Send the richer data back to the background script.
    if (scrapedData.length > 0) {
        chrome.runtime.sendMessage({
            command: 'scrapedData',
            data: scrapedData
        });
    }

})();