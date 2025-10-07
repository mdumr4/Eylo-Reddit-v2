(function() {
    console.log("Content script running for enhanced scraping (with debug logs)...");

    // New, more robust selector for the entire post container
    const postContainerSelector = 'shreddit-post';
    console.log("Looking for post containers with selector:", postContainerSelector);
    const postContainers = document.querySelectorAll(postContainerSelector);
    console.log(`Found ${postContainers.length} post containers.`);
    
    const scrapedData = [];

    postContainers.forEach((container, index) => {
        console.log(`Processing container ${index}...`);
        
        // Extract author and permalink directly from the shreddit-post attributes
        const author = container.getAttribute('author');
        const permalink = container.getAttribute('permalink'); // This is the relative URL
        const postTitle = container.getAttribute('post-title'); // Also useful for context

        // Construct the full URL
        const postUrl = permalink ? `https://www.reddit.com${permalink}` : null;

        if (author && postUrl && postTitle) {
            scrapedData.push({ author, postUrl, postTitle });
            console.log(`  - Found author: ${author}, postUrl: ${postUrl}, postTitle: ${postTitle}`);
        } else {
            console.log("  - Could not extract author, postUrl, or postTitle from attributes.");
            console.log("    Author found:", !!author);
            console.log("    Post URL found:", !!postUrl);
            console.log("    Post Title found:", !!postTitle);
        }
    });

    console.log(`Finished scraping. Total unique posts found: ${scrapedData.length}`);

    if (scrapedData.length > 0) {
        console.log("Sending scraped data to background script:", scrapedData);
        chrome.runtime.sendMessage({
            command: 'scrapedData',
            data: scrapedData
        });
    } else {
        console.log("No posts scraped. Not sending message to background script.");
    }

})();