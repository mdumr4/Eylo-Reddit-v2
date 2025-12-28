// --- Centralized State Management ---
const state = {
    isRunning: false,
    messageBody: null,
    token: null,
    queue: [], // Array of { user, retryCount }
    activeTabId: null, // The SINGLE active tab
    processedCount: 0,
    messagedCount: 0,
    skippedCount: 0,
    totalUsers: 0, // Track total for UI progress bar
    failedUsers: [],
    log: ["Welcome! Click Start to begin."],
    error: null,
    tabUserMap: new Map() // Still needed for message correlation
};

// Function to add a log message
function addLog(message) {
    console.log(message);
    state.log.unshift(message);
    if (state.log.length > 100) {
        state.log.pop();
    }
}

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const commands = {
        'start': handleStart,
        'stop': handleStop,
        'getState': () => sendResponse(state),
        'agentRequestNavigation': handleAgentRequestNavigation,
        'messagingError': handleMessagingError, // Maps to Workflow Error
        'messageSent': handleMessageSent,      // Maps to Workflow Complete
        'postScraped': handlePostScraped,      // Intermediate Step
        'workflowSkip': handleWorkflowSkip,    // Explicit Skip
        'scrapedData': handleScrapedData       // Initial Scan Data
    };

    const commandHandler = commands[message.command];
    if (commandHandler) {
        // Return true to indicate async response might be needed
        Promise.resolve(commandHandler(message, sender)).then(sendResponse);
        return true;
    }
});

// --- Command Handlers ---

function handleStart(message) {
    addLog("🚀 Starting new run...");
    Object.assign(state, {
        isRunning: true,
        mainPrompt: message.data.mainPrompt,
        token: message.data.token,
        queue: [],
        processedCount: 0,
        messagedCount: 0,
        skippedCount: 0,
        failedUsers: [],
        log: ["🚀 Starting automation..."],
        error: null
    });

    const users = message.data.users || [];
    if (users.length > 0) {
        state.totalUsers = users.length; // Set total for UI
        addLog(`🔁 Queuing retry for ${users.length} users.`);
        processUsers(users);
    } else {
        addLog("🔍 Kicking off automation to find new users...");
        startAutomation();
    }
}

function handleStop() {
    addLog("🛑 Stop command received. Halting soon.");
    state.isRunning = false;
}

// --- Queue System (The Core Loop) ---

// We use an internal variable to resolve the Promise of the current user
let currentUserResolver = null;
let currentUserRejecter = null;

function waitForTabLoad(tabId) {
    return new Promise(resolve => {
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError || !tab) return resolve(); // Just continue if error
            if (tab.status === 'complete') return resolve();

            const listener = (updatedTabId, changeInfo) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processUsers(users) {
    // 1. Initialize Queue
    state.queue = users.map(u => ({ user: u, retryCount: 0 }));
    addLog(`📨 Queue initialized with ${state.queue.length} users.`);

    // 2. Start Loop
    while (state.queue.length > 0 && state.isRunning) {
        const item = state.queue.shift();
        const { user, retryCount } = item;

        addLog(`--------------------------------------------------`);
        addLog(`👉 Processing (${state.processedCount + 1}): ${user.author} (Attempt ${retryCount + 1})`);

        try {
            // A. Manage Tab
            if (state.activeTabId) {
                try {
                    // Check if tab exists
                    await chrome.tabs.get(state.activeTabId);
                    await chrome.tabs.update(state.activeTabId, { url: user.postUrl });
                } catch (e) {
                    const tab = await chrome.tabs.create({ url: user.postUrl, active: false });
                    state.activeTabId = tab.id;
                }
            } else {
                const tab = await chrome.tabs.create({ url: user.postUrl, active: false });
                state.activeTabId = tab.id;
            }

            // Map tab to user so handlers know who we are talking about
            state.tabUserMap.set(state.activeTabId, user);

            await waitForTabLoad(state.activeTabId);

            // B. Inject Agent (Starts the workflow)
            await chrome.scripting.executeScript({
                target: { tabId: state.activeTabId },
                files: ['src/agent.js']
            });

            // C. WAIT for workflow result
            // This promise will be resolved by handleWorkflowComplete/Error/Skip
            const result = await new Promise((resolve, reject) => {
                currentUserResolver = resolve;
                currentUserRejecter = reject;

                // Timeout (2 mins max per user)
                setTimeout(() => {
                    reject(new Error("Timeout waiting for user completion"));
                }, 120000);
            });

            addLog(`✅ Work for ${user.author} finished: ${result}`);
            state.processedCount++;

        } catch (error) {
            addLog(`⚠️ Attempt ${retryCount + 1} failed for ${user.author}: ${error.message}`);

            if (retryCount < 3) {
                addLog(`🔄 Re-queueing ${user.author} at the end.`);
                state.queue.push({ user, retryCount: retryCount + 1 });
            } else {
                addLog(`❌ Max retries reached for ${user.author}. Dropping.`);
                state.failedUsers.push(user);
            }
        } finally {
            currentUserResolver = null;
            currentUserRejecter = null;
        }

        // Random Delay
        const delay = Math.random() * (20000 - 10000) + 10000;
        addLog(`⏳ Waiting ${Math.round(delay / 1000)}s before next...`);
        await sleep(delay);
    }

    if (state.isRunning) {
        addLog("✅ All queue items processed.");
        state.isRunning = false;
    }
}

// --- Handler Logic Bridge ---

// 1. Post Scraped -> Call API -> Decide
async function handlePostScraped(message, sender) {
    if (sender.tab.id !== state.activeTabId) return; // Ignore stale tabs

    const user = state.tabUserMap.get(sender.tab.id);
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

        if (response.status === 429) {
            // Signal Retry to the main loop?
            // Better: Just throw error, Main Loop catches -> Re-queues.
            throw new Error("Rate Limit (429)");
        }

        const result = await response.json();
        addLog(`🤖 AI Decision: ${result.should_message}`); // LOGGING BACKEND DECISION

        if (result.should_message === "YES") {
            addLog(`👍 Decision YES. Navigating to profile...`);
            state.messageBody = result.message_body;

            // Tell Agent to Click Link
            chrome.tabs.sendMessage(state.activeTabId, { command: 'navigateProfile' });
            // Now we wait for 'agentRequestNavigation' or 'workflowError'
        } else {
            addLog(`👎 Decision NO.`);
            resolveCurrent("Skipped (AI No)");
        }

    } catch (e) {
        rejectCurrent(e);
    }
}

// 2. Agent clicked link -> Page Loading... -> Re-Inject
async function handleAgentRequestNavigation(message, sender) {
    if (sender.tab.id !== state.activeTabId) return;

    addLog(`🖱️ Agent navigated. Waiting for load...`);
    await waitForTabLoad(state.activeTabId);

    // Inject again
    await chrome.scripting.executeScript({
        target: { tabId: state.activeTabId },
        files: ['src/agent.js']
    });

    // Start Chat
    addLog(`💬 Opening chat...`);
    chrome.tabs.sendMessage(state.activeTabId, {
        command: 'doChat',
        data: { messageBody: state.messageBody }
    });
}

// 3. Message Sent -> Log -> Success
async function handleMessageSent(message, sender) {
    if (sender.tab.id !== state.activeTabId) return;
    const user = state.tabUserMap.get(state.activeTabId);

    addLog(`✅ Message sent! Logging...`);
    state.messagedCount++;

    try {
        await fetch('http://127.0.0.1:5000/api/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ username: user.author, subreddit: user.subreddit || 'unknown' }),
        });
        resolveCurrent("Success (Sent & Logged)");
    } catch (e) {
        // Even if logging fails, message was sent.
        resolveCurrent("Success (Sent, Log Failed)");
    }
}

function handleMessagingError(message, sender) {
    addLog(`❌ Client Error: ${message.data.error}`);
    rejectCurrent(new Error(message.data.error));
}

function handleWorkflowSkip() {
    resolveCurrent("Skipped (Agent Signal)");
}

// --- Helper to resolve main loop ---
function resolveCurrent(msg) {
    if (currentUserResolver) currentUserResolver(msg);
}
function rejectCurrent(err) {
    if (currentUserRejecter) currentUserRejecter(err);
}

// --- Initial Scraper ---
async function startAutomation() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes('reddit.com')) {
        addLog("❌ Not on Reddit.");
        state.isRunning = false;
        return;
    }
    // Inject initial scraper (content_script.js - need to create this if missing or use inline)
    // Assuming content_script.js exists or we reuse agent?
    // Agent is for single user. Initial scan needs a scanner.
    // Let's reuse 'content_script.js' logic but ensure it exists?
    // User didn't delete content_script.js.

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content_script.js']
        });
    } catch (e) {
        addLog(`❌ Inject Error: ${e.message}`);
        state.isRunning = false;
    }
}

// Handlers for initial scan result
function handleScrapedData(message) {
    // This comes from content_script.js
    // Filter users then call processUsers
    filterUsers(message.data);
}

async function filterUsers(scrapedPosts) {
    if (!state.isRunning) return;
    const authors = [...new Set(scrapedPosts.map(p => p.author))];
    addLog(`Found ${authors.length} authors. Checking DB...`);

    try {
        const response = await fetch('http://127.0.0.1:5000/api/check-users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ usernames: authors }),
        });
        const result = await response.json();

        // Match posts to new authors
        const uniquePosts = [];
        const seen = new Set();
        const newPool = new Set(result.new_users);

        for (const p of scrapedPosts) {
            if (newPool.has(p.author) && !seen.has(p.author)) {
                uniquePosts.push(p);
                seen.add(p.author);
            }
        }

        if (uniquePosts.length === 0) {
            addLog("No new users found.");
            state.isRunning = false;
        } else {
            state.totalUsers = uniquePosts.length; // Set total for UI
            processUsers(uniquePosts);
        }

    } catch (e) {
        addLog(`❌ Check Failed: ${e.message}`);
        state.isRunning = false;
    }
}