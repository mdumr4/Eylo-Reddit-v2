import { SupabaseClient } from './supabase_client.js';

const client = new SupabaseClient();

// UI Elements
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginError = document.getElementById('login-error');

// --- State Management ---

export async function checkSession() {
    const result = await chrome.storage.local.get(['session']);
    if (result.session && result.session.access_token) {
        // Optional: Verify token is still valid via API?
        // For speed, we just assume valid and let Backend reject if invalid.
        showDashboard();
    } else {
        showLogin();
    }
}

function showLogin() {
    loginScreen.style.display = 'block';
    dashboardScreen.style.display = 'none';
}

function showDashboard() {
    loginScreen.style.display = 'none';
    dashboardScreen.style.display = 'block';
}

// --- Event Listeners ---

if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value;
        const password = passwordInput.value;

        loginError.textContent = "";
        loginBtn.disabled = true;
        loginBtn.textContent = "Logging in...";

        try {
            const data = await client.signInWithPassword(email, password);

            // Save session
            await chrome.storage.local.set({ session: data });

            showDashboard();
        } catch (error) {
            loginError.textContent = error.message;
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = "Login";
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove('session');
        showLogin();
    });
}

// Initialize
checkSession();
