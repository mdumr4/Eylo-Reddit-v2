// --- Centralized State Management ---
const state = {
    isRunning: false,
    messageBody: null, // Placeholder for generated message
    token: null, // Supabase Access Token
    usersToProcess: [],
    processedCount: 0,
    messagedCount: 0,
    skippedCount: 0,
    failedUsers: [],
    log: ["Welcome! Click Start to begin."],
    error: null,
    tabUserMap: new Map() // Maps tab IDs to the user object being processed
};

// Function to add a log message
function addLog(message) {
    console.log(message); // Also log to the background console for debugging
    state.log.unshift(message); // Add to the beginning of the array
    if (state.log.length > 100) {
        state.log.pop(); // Keep the log from growing indefinitely
    }
}

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const commands = {
        'start': handleStart,
        'stop': handleStop,
        'getState': () => sendResponse(state),
        'scrapedData': handleScrapedData,
        'postScraped': handlePostScraped,
        'agentRequestNavigation': handleAgentRequestNavigation,
        'messagingError': handleMessagingError,
        'messageSent': handleMessageSent
    };

    const commandHandler = commands[message.command];
    if (commandHandler) {
        Promise.resolve(commandHandler(message, sender)).then(sendResponse);
        return true;
    }
});

// --- Command Handlers ---
function handleStart(message) {
    addLog("🚀 Starting new run...");
    Object.assign(state, {
        isRunning: true,
        isRunning: true,
        mainPrompt: message.data.mainPrompt,
        token: message.data.token,
        usersToProcess: message.data.users || [],
        processedCount: 0,
        messagedCount: 0,
        skippedCount: 0,
        failedUsers: [],
        log: ["🚀 Starting automation..."],
        error: null
    });

    if (state.usersToProcess.length > 0) {
        addLog(`🔁 Starting retry for ${state.usersToProcess.length} failed users.`);
        processUsers(state.usersToProcess);
    } else {
        addLog("🔍 Kicking off automation to find new users...");
        startAutomation();
    }
}

function handleStop() {
    addLog("🛑 Stop command received. Automation will halt after the current task.");
    state.isRunning = false;
}

function handleScrapedData(message) {
    filterUsers(message.data);
}

function handleMessagingError(message, sender) {
    const tabId = sender.tab.id;
    const user = state.tabUserMap.get(tabId);
    const errorMessage = message.data.error || "An unknown UI automation error occurred.";

    addLog(`❌ Error processing user ${user?.author || 'unknown'}: ${errorMessage}`);
    state.error = `Error on user ${user?.author}: ${errorMessage}`;

    if (user) {
        if (!state.failedUsers.some(u => u.author === user.author)) {
            state.failedUsers.push(user);
        }
    }
    state.processedCount++;

    if (tabId) {
        chrome.tabs.remove(tabId);
        state.tabUserMap.delete(tabId);
    }
}

async function handlePostScraped(message, sender) {
    const tabId = sender.tab.id;
    const user = state.tabUserMap.get(tabId);
    if (!user) return;

    addLog(`🧠 Analyzing post by ${user.author}...`);

    try {
        const response = await fetch('http://127.0.0.1:5000/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                post_content: message.data.postContent,
                main_prompt: state.mainPrompt
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ message: "Could not parse error response." }));
            throw new Error(errorBody.user_message || `Backend responded with status ${response.status}`);
        }
        const result = await response.json();

        addLog(`🤖 AI decision for ${user.author}: ${result.should_message}`);

        if (result.should_message === "YES") {
            addLog(`👍 AI approved. Navigating to ${user.author}'s profile...`);
            // Tell agent to navigate (it finds the link)
            state.messageBody = result.message_body; // Store message for next step
            chrome.tabs.sendMessage(tabId, { command: 'navigateProfile' });
        } else {
            state.skippedCount++;
            state.processedCount++;
            addLog(`👎 AI rejected. Skipping user ${user.author}.`);
            chrome.tabs.remove(tabId);
            state.tabUserMap.delete(tabId);
        }

    } catch (error) {
        addLog(`❌ Error during AI processing for ${user.author}: ${error.message}`);
        state.error = `AI API error on user ${user.author}. Please check backend logs.`;
        if (user) {
            if (!state.failedUsers.some(u => u.author === user.author)) {
                state.failedUsers.push(user);
            }
        }
        state.processedCount++;
        chrome.tabs.remove(tabId);
        state.tabUserMap.delete(tabId);
    }
}

async function handleAgentRequestNavigation(message, sender) {
    const tabId = sender.tab.id;
    const url = message.data.url;

    // Update Tab URL
    await chrome.tabs.update(tabId, { url: url });

    // Wait for load
    await waitForTabLoad(tabId);

    // Inject Agent Again (New Context)
    await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['src/agent.js']
    });

    // Command to Chat
    addLog(`💬 Opening chat with ${state.tabUserMap.get(tabId)?.author}...`);
    chrome.tabs.sendMessage(tabId, {
        command: 'doChat',
        data: { messageBody: state.messageBody }
    });
}

async function handleMessageSent(message, sender) {
    const tabId = sender.tab.id;
    const user = state.tabUserMap.get(tabId);
    if (!user) return;

    addLog(`✅ Message sent to ${user.author}.`);
    state.messagedCount++;
    state.processedCount++;

    try {
        await fetch('http://127.0.0.1:5000/api/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ username: user.author, subreddit: user.subreddit || 'unknown' }),
        });
        addLog(`📝 Successfully logged ${user.author} to database.`);
    } catch (error) {
        addLog(`⚠️ Failed to log user ${user.author}: ${error.message}`);
    } finally {
        chrome.tabs.remove(tabId);
        state.tabUserMap.delete(tabId);
    }
}

// --- Workflow Functions ---
function waitForTabLoad(tabId) {
    return new Promise(resolve => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function startAutomation() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url.includes('reddit.com')) {
        addLog("❌ Error: Not on a Reddit page. Stopping automation.");
        state.isRunning = false;
        return;
    }

    addLog(`🔎 Scanning subreddit: ${tab.url.split('?')[0]}`);

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content_script.js']
        });
    } catch (error) {
        addLog(`❌ Error: Failed to inject content script: ${error.message}`);
        state.isRunning = false;
    }
}

async function filterUsers(scrapedPosts) {
    if (!state.isRunning) return;
    const authors = scrapedPosts.map(post => post.author);
    const uniqueAuthors = [...new Set(authors)];

    addLog(`Found ${uniqueAuthors.length} unique authors. Checking against database...`);
    try {
        const response = await fetch('http://127.0.0.1:5000/api/check-users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ usernames: uniqueAuthors }),
        });
        if (!response.ok) throw new Error(`Backend responded with status: ${response.status}`);
        const result = await response.json();
        const newAuthors = new Set(result.new_users);

        const uniquePosts = [];
        const seenAuthors = new Set();
        for (const post of scrapedPosts) {
            if (newAuthors.has(post.author) && !seenAuthors.has(post.author)) {
                uniquePosts.push(post);
                seenAuthors.add(post.author);
            }
        }

        state.usersToProcess = uniquePosts;
        addLog(`Found ${state.usersToProcess.length} new users to process.`);
        processUsers(state.usersToProcess);
    } catch (error) {
        addLog(`❌ Error communicating with the backend: ${error.message}`);
        state.isRunning = false;
    }
}

async function processUsers(users) {
    addLog(`📨 Starting to process ${users.length} users one by one.`);
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (const user of users) {
        if (!state.isRunning) {
            addLog("🛑 Automation stopped by user.");
            break;
        }
        addLog(`(${state.processedCount + 1}/${state.usersToProcess.length}) Processing user: ${user.author}...`);
        let tab = null;
        try {
            tab = await chrome.tabs.create({ url: user.postUrl, active: false });
            state.tabUserMap.set(tab.id, user);

            await waitForTabLoad(tab.id);

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/agent.js']
            });

        } catch (error) {
            addLog(`❌ Critical error creating tab for ${user.author}: ${error.message}`);
            if (user) {
                if (!state.failedUsers.some(u => u.author === user.author)) {
                    state.failedUsers.push(user);
                }
            }
            state.processedCount++;
            if (tab) {
                chrome.tabs.remove(tab.id);
                state.tabUserMap.delete(tab.id);
            }
        }

        const randomDelay = Math.random() * (15000 - 5000) + 5000; // 5 to 15 seconds
        addLog(`⏳ Waiting for ${Math.round(randomDelay / 1000)}s before next user...`);
        await sleep(randomDelay);
    }

    if (state.isRunning) { // Only log completion if it wasn't stopped
        addLog("✅ Finished processing all users.");
        state.isRunning = false;
    }
}

console.log("Background script loaded and listening for messages.");