(function () {
    console.log("Content script running: Robust Scanning...");

    function scrapePosts() {
        const posts = [];

        // Strategy 1: Shreddit (Modern UI)
        const shredditPosts = document.querySelectorAll('shreddit-post');
        if (shredditPosts.length > 0) {
            console.log(`Scanner: Found ${shredditPosts.length} shreddit-post elements.`);
            shredditPosts.forEach(p => {
                const author = p.getAttribute('author');
                const permalink = p.getAttribute('permalink');
                const title = p.getAttribute('post-title');
                if (author && permalink && author !== '[deleted]') {
                    posts.push({
                        author,
                        postUrl: `https://www.reddit.com${permalink}`,
                        postTitle: title || 'Untitled'
                    });
                }
            });
        }

        // Strategy 2: Classic/Old Reddit (div.thing)
        if (posts.length === 0) {
            const things = document.querySelectorAll('div.thing');
            if (things.length > 0) {
                console.log(`Scanner: Found ${things.length} classic elements.`);
                things.forEach(t => {
                    const author = t.getAttribute('data-author');
                    const permalink = t.getAttribute('data-permalink');
                    if (author && permalink && author !== '[deleted]') {
                        posts.push({
                            author,
                            postUrl: `https://www.reddit.com${permalink}`,
                            postTitle: t.querySelector('a.title')?.innerText || 'Untitled'
                        });
                    }
                });
            }
        }

        // Strategy 3: Articles (Newest Feed)
        if (posts.length === 0) {
            const articles = document.querySelectorAll('article');
            if (articles.length > 0) {
                console.log(`Scanner: Found ${articles.length} article elements.`);
                articles.forEach(a => {
                    // Try to find author link inside
                    const authorLink = a.querySelector('a[href^="/user/"]');
                    const postLink = a.querySelector('a[href*="/comments/"]');
                    if (authorLink && postLink) {
                        const author = authorLink.getAttribute('href').split('/user/')[1].replace('/', '');
                        posts.push({
                            author,
                            postUrl: postLink.href,
                            postTitle: a.querySelector('h3, h1')?.innerText || 'Untitled'
                        });
                    }
                });
            }
        }

        return posts;
    }

    const scrapedData = scrapePosts();
    console.log(`Scanner: Sending ${scrapedData.length} posts to background.`);

    // ALWAYS send a response, even if empty
    chrome.runtime.sendMessage({
        command: 'scrapedData',
        data: scrapedData // Can be empty array
    });

})();