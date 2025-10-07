document.addEventListener('DOMContentLoaded', () => {
    const startStopBtn = document.getElementById('startStopBtn');
    const promptEl = document.getElementById('prompt');
    const conditionsEl = document.getElementById('conditions');
    const statusLogEl = document.getElementById('statusLog');

    let isRunning = false; // This state is managed by background.js, but popup needs a local copy

    // --- Load saved data and state when popup opens ---
    chrome.storage.local.get(['prompt', 'conditions', 'isRunning'], (result) => {
        if (result.prompt) promptEl.value = result.prompt;
        if (result.conditions) conditionsEl.value = result.conditions;
        if (result.isRunning !== undefined) {
            isRunning = result.isRunning;
            updateButtonState();
        }
    });

    // --- Save data when input changes ---
    promptEl.addEventListener('input', () => {
        chrome.storage.local.set({ prompt: promptEl.value });
    });
    conditionsEl.addEventListener('input', () => {
        chrome.storage.local.set({ conditions: conditionsEl.value });
    });

    startStopBtn.addEventListener('click', () => {
        if (isRunning) {
            // --- STOP LOGIC ---
            isRunning = false;
            chrome.storage.local.set({ isRunning: false }); // Save state
            updateButtonState();
            logStatus('Stopping...');
            
            // Send a message to the background script to stop the process
            chrome.runtime.sendMessage({ command: 'stop' });

        } else {
            // --- START LOGIC ---
            const prompt = promptEl.value;
            const conditions = conditionsEl.value;

            if (!prompt || !conditions) {
                logStatus('Error: Prompt and Conditions cannot be empty.');
                return;
            }

            isRunning = true;
            chrome.storage.local.set({ isRunning: true }); // Save state
            updateButtonState();
            logStatus('Starting...');

            // Send a message to the background script to start the process
            chrome.runtime.sendMessage({
                command: 'start',
                data: {
                    prompt: prompt,
                    conditions: conditions
                }
            });
        }
    });

    function updateButtonState() {
        if (isRunning) {
            startStopBtn.textContent = 'Stop';
            startStopBtn.style.backgroundColor = '#f44336'; // Red
        } else {
            startStopBtn.textContent = 'Start';
            startStopBtn.style.backgroundColor = '#4CAF50'; // Green
        }
    }

    function logStatus(message) {
        // Add new messages to the top of the log
        statusLogEl.innerHTML = message + '<br>' + statusLogEl.innerHTML;
    }
});