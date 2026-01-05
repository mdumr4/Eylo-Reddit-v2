// --- Centralized State Management ---
import { SUPABASE_URL, SUPABASE_ANON_KEY, BACKEND_URL } from './config.js';

const state = {
    isRunning: false,
    messageBody: null,
    token: null,
    refreshToken: null,
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

// --- Helper: Refresh Session ---
let refreshPromise = null;

async function refreshSession() {
    if (refreshPromise) {
        addLog("🔄 Token refresh already in progress. Waiting...");
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            // 1. Check Storage for a newer token (Handling Popup/Auth.js auto-refresh)
            const stored = await chrome.storage.local.get(['session']);
            if (stored.session && stored.session.refresh_token && stored.session.refresh_token !== state.refreshToken) {
                addLog("✨ Found fresher token in storage! Adopting it.");
                state.token = stored.session.access_token;
                state.refreshToken = stored.session.refresh_token;
                if (stored.session.user) state.user = stored.session.user;
                return true; // Use the stored one, don't burn a refresh
            }

            // 2. Perform Refresh
            const tokenPart = state.refreshToken ? state.refreshToken.slice(-5) : "NULL";
            addLog(`🔄 Refreshing session (Token ends in ...${tokenPart})...`);

            const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_token: state.refreshToken })
            });

            if (!response.ok) throw new Error(`Refresh failed: ${response.statusText}`);

            const data = await response.json();
            state.token = data.access_token;
            state.refreshToken = data.refresh_token;

            // Update storage for next time
            await chrome.storage.local.set({ session: { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user } });

            addLog("✅ Session refreshed successfully.");
            return true;
        } catch (e) {
            addLog(`❌ Critical Auth Error: ${e.message}`);
            state.isRunning = false; // Stop automation
            return false;
        } finally {
            refreshPromise = null; // Release Lock
        }
    })();

    return refreshPromise;
}

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
        'scrapedData': handleScrapedData,      // Initial Scan Data
        'scanHistory': handleScanHistory,      // Manual History Sync
        'chatHistoryScraped': handleChatHistoryScraped // Result of History Sync
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
        refreshToken: message.data.refreshToken,
        queue: [],
        processedCount: 0,
        messagedCount: 0,
        skippedCount: 0,
        failedUsers: [],
        log: ["🚀 Starting automation..."],
        error: null
    });

    const runId = Date.now();
    state.runId = runId;

    const users = message.data.users || [];
    if (users.length > 0) {
        state.totalUsers = users.length; // Set total for UI
        addLog(`🔁 Queuing retry for ${users.length} users.`);
        processUsers(users, runId);
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

async function processUsers(users, runId) {
    // 1. Initialize Queue
    state.queue = users.map(u => ({ user: u, retryCount: 0 }));
    addLog(`📨 Queue initialized with ${state.queue.length} users.`);

    // 2. Start Loop
    while (state.queue.length > 0 && state.isRunning) {
        // Concurrency Check
        if (state.runId && state.runId !== runId) {
            addLog("⚠️ Newer run started. specific loop terminating.");
            break;
        }

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

            // Trigger Scrape
            await sleep(1000); // Wait for script to init
            chrome.tabs.sendMessage(state.activeTabId, { command: 'scrape' });

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

            // Critical Error Check
            if (error.message.includes("Auth Failed")) {
                addLog("🛑 Critical Auth Failure. Stopping automation. Please Re-Login.");
                state.isRunning = false;
                break;
            }

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
        const delay = Math.random() * (8000 - 2000) + 2000;
        addLog(`⏳ Waiting ${Math.round(delay / 1000)}s before next...`);
        await sleep(delay);
    }

    if (state.isRunning && state.runId === runId) {
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
        let response = await fetch(`${BACKEND_URL}/api/generate`, {
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

        if (response.status === 401) {
            const refreshed = await refreshSession();
            if (refreshed) {
                response = await fetch(`${BACKEND_URL}/api/generate`, {
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
            } else {
                throw new Error("Auth Failed (401) - Refresh Failed");
            }
        }

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

            // Tell Agent to Click Link or Send URL
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

    if (message.data && message.data.url && message.data.url.startsWith('http')) {
        addLog(`🖱️ Navigating to profile: ${message.data.url}`);
        await chrome.tabs.update(state.activeTabId, { url: message.data.url });
    } else {
        addLog(`🖱️ Agent clicked. Waiting for load...`);
    }

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

// 2a. Sync History Scraped Data Handlers
async function handleScanHistory(message) {
    addLog("🕵️ Starting Chat History Sync...");
    state.token = message.data.token;
    state.refreshToken = message.data.refreshToken;

    // Create tab for chat
    const tab = await chrome.tabs.create({ url: 'https://chat.reddit.com', active: true });
    state.activeTabId = tab.id;

    await waitForTabLoad(tab.id);
    addLog("✅ Loaded Chat. Injecting Scraper...");

    // Inject scraper
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/chat_history_scraper.js']
    });
}

async function handleChatHistoryScraped(message, sender) {
    const usernames = message.data.usernames;
    addLog(`📦 Received ${usernames.length} usernames. Syncing to DB...`);

    try {
        let response = await fetch(`${BACKEND_URL}/api/log-bulk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ usernames: usernames }),
        });

        if (response.status === 401) {
            const refreshed = await refreshSession();
            if (refreshed) {
                response = await fetch(`${BACKEND_URL}/api/log-bulk`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: JSON.stringify({ usernames: usernames }),
                });
            }
        }

        const res = await response.json();
        if (res.status === 'success') {
            addLog(`✅ Synced ${res.count} users successfully!`);
            // Optional: Close tab?
            // chrome.tabs.remove(sender.tab.id);
        } else {
            addLog(`⚠️ Sync warning: ${res.error}`);
        }
    } catch (e) {
        addLog(`❌ Sync Failed: ${e.message}`);
    }
}

// 3. Message Sent -> Log -> Success
async function handleMessageSent(message, sender) {
    if (sender.tab.id !== state.activeTabId) return;
    const user = state.tabUserMap.get(state.activeTabId);

    addLog(`✅ Message sent! Logging...`);
    state.messagedCount++;

    try {
        let logResponse = await fetch(`${BACKEND_URL}/api/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ reddit_username: user.author }),
        });

        if (logResponse.status === 401) {
            const refreshed = await refreshSession();
            if (refreshed) {
                await fetch(`${BACKEND_URL}/api/log`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: JSON.stringify({ reddit_username: user.author }),
                });
            }
        }
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
        const response = await fetch(`${BACKEND_URL}/api/check-users`, {
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
            processUsers(uniquePosts, state.runId);
        }

    } catch (e) {
        addLog(`❌ Check Failed: ${e.message}`);
        state.isRunning = false;
    }
}