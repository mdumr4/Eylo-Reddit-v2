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
        'scrapingError': handleScrapingError,
        'messageSent': handleMessageSent
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
    filterUsers(message.data);
}

function handleScrapingError(message, sender) {
    console.error(`Scraping error in tab ${sender.tab.id}:`, message.data.error);
    chrome.tabs.remove(sender.tab.id); // Re-enabled tab closure
    tabUserMap.delete(sender.tab.id); // Re-enabled map deletion
}

async function handleScrapedPostContent(message, sender) {
    const tabId = sender.tab.id;
    const user = tabUserMap.get(tabId);
    if (!user) return;

    console.log(`Received post content for user ${user.author}`);

    try {
        // --- RE-ENABLED ACTUAL GEMINI API CALL ---
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
        // --- END RE-ENABLED ACTUAL GEMINI API CALL ---

        console.log(`Gemini decision for ${user.author}:`, result);

        if (result.should_message === "YES") {
            console.log(`Sending message command to tab ${tabId} for user ${user.author}.`);
            chrome.tabs.sendMessage(tabId, { command: 'sendMessage', data: result });
        } else {
            console.log(`Skipping user ${user.author} as per Gemini decision.`);
        }

    } catch (error) {
        console.error('Error during Gemini processing for tab', tabId, error);
        chrome.tabs.remove(tabId); // Re-enabled tab closure
        tabUserMap.delete(tabId); // Re-enabled map deletion
    }
}

async function handleMessageSent(message, sender) {
    const tabId = sender.tab.id;
    const user = tabUserMap.get(tabId);
    if (!user) return;

    console.log(`Confirmed message sent to ${user.author}. Logging to database.`);
    try {
        await fetch('http://127.0.0.1:5000/log-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.author }),
        });
        console.log(`Successfully logged ${user.author}.`);
    } catch (error) {
        console.error(`Failed to log user ${user.author}:`, error);
    }
}

// --- Workflow Functions ---
// Helper function to wait for a tab to finish loading
function waitForTabLoad(tabId) {
    return new Promise(resolve => {
        const listener = (updatedTabId, changeInfo, tab) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener); // Remove listener to prevent memory leaks
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function startAutomation() {
    console.log("Kicking off automation...");
    console.log("Querying for active tab...");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("Active tab query complete.");

    if (!tab || !tab.url.includes('reddit.com')) {
        console.error("Not on a Reddit page. Stopping automation.");
        isRunning = false;
        return;
    }

    console.log(`Running on tab: ${tab.id}, URL: ${tab.url}`);

    try {
        console.log("Attempting to inject content script...");
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: uniqueAuthors }),
        });
        if (!response.ok) throw new Error(`Backend responded with status: ${response.status}`);
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
        let tab = null; // Declare tab outside try block
        try {
            tab = await chrome.tabs.create({ url: user.postUrl, active: false });
            tabUserMap.set(tab.id, user);
            console.log(`Created background tab ${tab.id} for user ${user.author}`);
            console.log(`Waiting for tab ${tab.id} to load...`);
            await waitForTabLoad(tab.id);
            console.log(`Tab ${tab.id} loaded. Attempting to inject post_handler.js.`);
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['post_handler.js']
            });
            console.log(`Injected post_handler.js into tab ${tab.id}`);
        } catch (error) {
            console.error(`Error processing user ${user.author} in loop:`, error);
            // Do NOT remove tab or delete from map here, as it might be needed for further debugging
            // The error in post_handler.js will send a scrapingError command which handles tab closure
        }
        const randomDelay = Math.random() * 5000 + 3000;
        console.log(`Waiting for ${Math.round(randomDelay / 1000)}s before next user...`);
        await sleep(randomDelay);
    }
    console.log("Finished processing all users.");
    isRunning = false;
}

console.log("Background script loaded and listening.");