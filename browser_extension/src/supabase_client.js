import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export class SupabaseClient {
    constructor() {
        this.baseUrl = SUPABASE_URL;
        this.key = SUPABASE_ANON_KEY;
    }

    async signInWithPassword(email, password) {
        const url = `${this.baseUrl}/auth/v1/token?grant_type=password`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': this.key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error_description || data.msg || "Login failed");
        }
        return data; // Contains access_token, refresh_token, user
    }

    async signUp(email, password) {
        const url = `${this.baseUrl}/auth/v1/signup`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': this.key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error_description || data.msg || "Signup failed");
        }
        return data; // Contains user? Check docs. Usually returns user object or session if auto-confirm.
    }

    async getUser(token) {
        const url = `${this.baseUrl}/auth/v1/user`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': this.key,
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (!response.ok) return null;
        return data;
    }
}
