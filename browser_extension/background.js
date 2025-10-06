// --- Global State ---
let isRunning = false;
let outreachData = {}; // Holds prompt and conditions from the UI
let tabUserMap = new Map(); // Maps tab IDs to the user object being processed in them

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const commands = {
        'start': handleStart,
        'stop': handleStop,
        'scrapedData': handleScrapedData,
        'scrapedPostContent': handleScrapedPostContent,
        'scrapingError': handleScrapingError
    };

    const commandHandler = commands[message.command];
    if (commandHandler) {
        commandHandler(message, sender);
    }

    return true; // Indicate that the response may be sent asynchronously
});

// --- Command Handlers ---
function handleStart(message) {
    console.log('Received "start" command.');
    outreachData = message.data;
    isRunning = true;
    console.log('Starting automation with data:', outreachData);
    startAutomation();
}

function handleStop() {
    console.log('Received "stop" command.');
    isRunning = false;
}

function handleScrapedData(message) {
    console.log('Received scraped data from content script:', message.data);
    filterUsers(message.data);
}

function handleScrapingError(message, sender) {
    console.error(`Scraping error in tab ${sender.tab.id}:`, message.data.error);
    chrome.tabs.remove(sender.tab.id); // Close the tab that had an error
    tabUserMap.delete(sender.tab.id);
}

async function handleScrapedPostContent(message, sender) {
    const tabId = sender.tab.id;
    const user = tabUserMap.get(tabId);
    if (!user) return;

    console.log(`Received post content from tab ${tabId} for user ${user.author}`);

    try {
        const response = await fetch('http://127.0.0.1:5000/generate-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                post_content: message.data.postContent,
                conditions: outreachData.conditions,
                prompt_instruction: outreachData.prompt
            }),
        });

        if (!response.ok) throw new Error(`Backend responded with status: ${response.status}`);

        const result = await response.json();
        console.log(`Gemini decision for ${user.author}:`, result);

        if (result.should_message === "YES") {
            // FINAL STEP (to be implemented next):
            // Send a command to post_handler.js to perform the messaging UI automation.
            console.log(`SUCCESS: Would now send message to ${user.author}.`);
            // chrome.tabs.sendMessage(tabId, { command: 'sendMessage', data: result });
        } else {
            console.log(`Skipping user ${user.author} as per Gemini decision.`);
        }

    } catch (error) {
        console.error('Error during Gemini processing:', error);
    } finally {
        // For now, we'll close the tab regardless. Later, this will be handled
        // after the message is confirmed sent.
        chrome.tabs.remove(tabId);
        tabUserMap.delete(tabId);
    }
}


// --- Workflow Functions ---
async function startAutomation() {
    console.log("Kicking off automation...");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url.includes('reddit.com')) {
        console.error("Not on a Reddit page. Stopping automation.");
        isRunning = false;
        return;
    }

    console.log(`Running on tab: ${tab.id}, URL: ${tab.url}`);

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content_script.js']
        });
        console.log("Content script injected successfully.");
    } catch (error) {
        console.error("Failed to inject content script:", error);
        isRunning = false;
    }
}

async function filterUsers(scrapedPosts) {
    if (!isRunning) return;

    const authors = scrapedPosts.map(post => post.author);
    const uniqueAuthors = [...new Set(authors)];

    console.log(`Sending ${uniqueAuthors.length} unique authors to the backend for filtering...`);
    try {
        const response = await fetch('http://127.0.0.1:5000/check-users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ usernames: uniqueAuthors }),
        });

        if (!response.ok) {
            throw new Error(`Backend responded with status: ${response.status}`);
        }

        const result = await response.json();
        const newAuthors = new Set(result.new_users);

        const fullDataForNewUsers = scrapedPosts.filter(post => newAuthors.has(post.author));

        console.log(`Backend returned ${fullDataForNewUsers.length} new users to process:`, fullDataForNewUsers);

        processUsers(fullDataForNewUsers);

    } catch (error) {
        console.error('Error communicating with the backend:', error);
        isRunning = false;
    }
}

async function processUsers(usersToProcess) {
    console.log(`Starting to process ${usersToProcess.length} users one by one.`);
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (const user of usersToProcess) {
        if (!isRunning) {
            console.log("Automation stopped by user.");
            break;
        }
        console.log(`Processing user: ${user.author}, post: ${user.postUrl}`);
        try {
            const tab = await chrome.tabs.create({ url: user.postUrl, active: false });
            tabUserMap.set(tab.id, user); // Associate tab ID with user data
            console.log(`Created background tab ${tab.id} for user ${user.author}`);
            
            await sleep(4000); // Give tab time to load before injecting
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['post_handler.js']
            });
        } catch (error) {
            console.error(`Error processing user ${user.author}:`, error);
        }
        
        const randomDelay = Math.random() * 5000 + 3000;
        await sleep(randomDelay);
    }
    console.log("Finished processing all users.");
    isRunning = false;
}

console.log("Background script loaded and listening.");