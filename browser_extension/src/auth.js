import { SupabaseClient } from './supabase_client.js';

const client = new SupabaseClient();

// UI Elements
const loginScreen = document.getElementById('login-screen');
const signupScreen = document.getElementById('signup-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const authContainer = document.getElementById('auth-container');

// Inputs
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signupEmailInput = document.getElementById('signup-email');
const signupPasswordInput = document.getElementById('signup-password');

// Buttons
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const showSignupBtn = document.getElementById('showSignupBtn');
const showLoginBtn = document.getElementById('showLoginBtn');

// Errors
const authError = document.getElementById('auth-error');

// --- State Management ---

export async function checkSession() {
    const result = await chrome.storage.local.get(['session']);
    if (result.session && result.session.access_token) {
        // Optional: Verify token is still valid via API?
        showDashboard();
    } else {
        showLogin();
    }
}

function showLogin() {
    authContainer.style.display = 'block';
    loginScreen.style.display = 'block';
    signupScreen.style.display = 'none';
    dashboardScreen.style.display = 'none';
    authError.textContent = '';
}

function showSignup() {
    authContainer.style.display = 'block';
    loginScreen.style.display = 'none';
    signupScreen.style.display = 'block';
    dashboardScreen.style.display = 'none';
    authError.textContent = '';
}

function showDashboard() {
    authContainer.style.display = 'none';
    dashboardScreen.style.display = 'block';
}

// --- Event Listeners ---

if (showSignupBtn) {
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showSignup();
    });
}

if (showLoginBtn) {
    showLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showLogin();
    });
}

if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value;
        const password = passwordInput.value;

        authError.textContent = "";
        loginBtn.disabled = true;
        loginBtn.textContent = "Logging in...";

        try {
            const data = await client.signInWithPassword(email, password);
            await chrome.storage.local.set({ session: data });
            showDashboard();
        } catch (error) {
            authError.textContent = error.message;
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = "Login";
        }
    });
}

if (signupBtn) {
    signupBtn.addEventListener('click', async () => {
        const email = signupEmailInput.value;
        const password = signupPasswordInput.value;

        authError.textContent = "";
        signupBtn.disabled = true;
        signupBtn.textContent = "Signing up...";

        try {
            const data = await client.signUp(email, password);

            // If Supabase returns a session immediately (auto-confirm enabled)
            if (data.session) {
                await chrome.storage.local.set({ session: data.session });
                showDashboard();
            } else if (data.user) {
                // Email confirmation required
                authError.textContent = "Signup successful! Please check your email to confirm.";
                // Optionally switch back to login
                setTimeout(() => showLogin(), 3000);
            } else {
                // Some specific error or state
                authError.textContent = "Signup succeeded but no session returned. Please try logging in.";
            }

        } catch (error) {
            authError.textContent = error.message;
        } finally {
            signupBtn.disabled = false;
            signupBtn.textContent = "Sign Up";
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
