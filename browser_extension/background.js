// A global variable to hold the state of the automation
let isRunning = false;

// A global variable to store the user's inputs
let outreachData = {};

// Listen for messages from other parts of the extension (e.g., the popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === 'start') {
        console.log('Received "start" command.');
        outreachData = message.data;
        isRunning = true;
        console.log('Starting automation with data:', outreachData);
        
        // Kick off the main automation loop
        startAutomation(); 

    } else if (message.command === 'stop') {
        console.log('Received "stop" command.');
        isRunning = false;
    }

    return true; 
});

async function startAutomation() {
    console.log("Kicking off automation...");

    // 1. Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url.includes('reddit.com')) {
        console.error("Not on a Reddit page. Stopping automation.");
        isRunning = false;
        // We should also notify the popup UI about this error.
        return;
    }

    console.log(`Running on tab: ${tab.id}, URL: ${tab.url}`);

    // 2. Execute the content script in the active tab
    // The content script will scrape the data and send it back via a message.
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

console.log("Background script loaded and listening.");