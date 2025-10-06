document.addEventListener('DOMContentLoaded', () => {
    const startStopBtn = document.getElementById('startStopBtn');
    const promptEl = document.getElementById('prompt');
    const conditionsEl = document.getElementById('conditions');
    const statusLogEl = document.getElementById('statusLog');

    // This is a simple way to keep track of the state.
    let isRunning = false;

    startStopBtn.addEventListener('click', () => {
        if (isRunning) {
            // --- STOP LOGIC ---
            isRunning = false;
            startStopBtn.textContent = 'Start';
            startStopBtn.style.backgroundColor = '#4CAF50'; // Green
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
            startStopBtn.textContent = 'Stop';
            startStopBtn.style.backgroundColor = '#f44336'; // Red
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

    function logStatus(message) {
        // Add new messages to the top of the log
        statusLogEl.innerHTML = message + '<br>' + statusLogEl.innerHTML;
    }
});