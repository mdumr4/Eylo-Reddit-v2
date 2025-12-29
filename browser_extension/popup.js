document.addEventListener('DOMContentLoaded', () => {
    // --- Get UI Elements ---
    const startStopBtn = document.getElementById('startStopBtn');
    const retryBtn = document.getElementById('retryBtn');
    const mainPromptEl = document.getElementById('mainPrompt');
    const statusLogEl = document.getElementById('statusLog');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const summaryEl = document.getElementById('summary');

    let statePoller; // To hold the interval ID

    // --- Load saved data when popup opens ---
    chrome.storage.local.get(['mainPrompt'], (result) => {
        if (result.mainPrompt) {
            mainPromptEl.value = result.mainPrompt;
        }
    });

    // --- Save data when input changes ---
    mainPromptEl.addEventListener('input', () => {
        chrome.storage.local.set({ mainPrompt: mainPromptEl.value });
    });

    // --- Event Listeners ---
    startStopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ command: 'getState' }, (state) => {
            if (state.isRunning) {
                // --- STOP LOGIC ---
                chrome.runtime.sendMessage({ command: 'stop' });
            } else {
                // --- START LOGIC ---
                const mainPrompt = mainPromptEl.value;
                if (!mainPrompt) {
                    logStatus('Error: Main Prompt cannot be empty.');
                    return;
                }

                // Get Auth Token
                chrome.storage.local.get(['session'], (result) => {
                    if (!result.session || !result.session.access_token) {
                        logStatus('Error: not logged in.');
                        return;
                    }
                    chrome.runtime.sendMessage({
                        command: 'start',
                        data: {
                            mainPrompt: mainPrompt,
                            token: result.session.access_token,
                            refreshToken: result.session.refresh_token
                        }
                    });
                });
            }
        });
    });

    retryBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ command: 'getState' }, (state) => {
            if (!state.isRunning && state.failedUsers.length > 0) {
                chrome.runtime.sendMessage({
                    command: 'start',
                    data: {
                        mainPrompt: state.mainPrompt,
                        users: state.failedUsers // Pass the list of users to retry
                    }
                });
            }
        });
    });

    // --- Sync History Handler ---
    const syncHistoryBtn = document.getElementById('syncHistoryBtn');
    if (syncHistoryBtn) {
        syncHistoryBtn.addEventListener('click', () => {
            chrome.storage.local.get(['session'], (result) => {
                if (!result.session || !result.session.access_token) {
                    logStatus('Error: not logged in.');
                    return;
                }
                chrome.runtime.sendMessage({
                    command: 'scanHistory',
                    data: {
                        token: result.session.access_token,
                        refreshToken: result.session.refresh_token
                    }
                });
            });
        });
    }

    // --- UI Update Functions ---
    function updateUI(state) {
        // Update button text and state
        if (state.isRunning) {
            startStopBtn.textContent = 'Stop';
            startStopBtn.style.backgroundColor = '#e74c3c'; // Red
            mainPromptEl.disabled = true;
        } else {
            startStopBtn.textContent = 'Start';
            startStopBtn.style.backgroundColor = '#2ecc71'; // Green
            mainPromptEl.disabled = false;
        }

        // Update status log
        statusLogEl.innerHTML = state.log.join('<br>');

        // Update progress bar and text
        if (state.isRunning && state.totalUsers > 0) {
            progressContainer.style.display = 'block';
            const progressPercentage = (state.processedCount / state.totalUsers) * 100;
            progressBar.style.width = `${progressPercentage}%`;
            progressText.textContent = `Processed: ${state.processedCount} / ${state.totalUsers}`;
        } else {
            progressContainer.style.display = 'none';
            progressText.textContent = '';
        }

        // Update summary and retry button
        summaryEl.style.display = 'none';
        retryBtn.style.display = 'none';

        if (!state.isRunning && state.processedCount > 0) {
            summaryEl.style.display = 'block';
            summaryEl.innerHTML = `
                <strong>Run Complete!</strong><br>
                - Messages Sent: ${state.messagedCount}<br>
                - Users Skipped: ${state.skippedCount}<br>
                - Users Failed: ${state.failedUsers.length}
            `;

            if (state.failedUsers.length > 0) {
                retryBtn.style.display = 'block';
                retryBtn.textContent = `Retry ${state.failedUsers.length} Failed User(s)`;
            }
        }

        // Display error message
        if (state.error) {
            logStatus(`<strong>Error:</strong> ${state.error}`);
        }
    }

    function logStatus(message) {
        statusLogEl.innerHTML = message + '<br>' + statusLogEl.innerHTML;
    }

    // --- State Polling ---
    function pollState() {
        chrome.runtime.sendMessage({ command: 'getState' }, (state) => {
            if (chrome.runtime.lastError) {
                // Background script might not be ready yet
                console.log("Polling failed, retrying...", chrome.runtime.lastError.message);
            } else if (state) {
                updateUI(state);
            }
        });
    }

    // When the popup is opened, start polling for the state.
    statePoller = setInterval(pollState, 500);
    // Also run it once immediately to prevent a flicker.
    pollState();

    // When the popup is closed, we don't need to do anything here,
    // as the interval will be cleared when the popup's context is destroyed.
});