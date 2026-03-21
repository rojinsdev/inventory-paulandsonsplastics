'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAPI } from './api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const router = useRouter();

    const checkSession = useCallback(async () => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

        if (!token) {
            setLoading(false);
            setUser(null);
            return;
        }

        try {
            const data = await fetchAPI('/auth/me');
            if (data && data.user) {
                setUser(data.user);
            } else {
                setUser(null);
            }
        } catch (err) {
            console.error('Session check failed:', err);
            if (err.message && (err.message.includes('401') || err.message.toLowerCase().includes('session expired'))) {
                setUser(null);
                localStorage.removeItem('auth_token');
                localStorage.removeItem('refresh_token');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    // Check session on mount
    useEffect(() => {
        checkSession();
    }, [checkSession]);

    const login = async (email, password) => {
        setError(null);
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Login failed');
            }

            // Store tokens
            localStorage.setItem('auth_token', data.session.access_token);
            if (data.session.refresh_token) {
                localStorage.setItem('refresh_token', data.session.refresh_token);
            }

            // Set user
            setUser(data.user);

            // Redirect to dashboard
            router.push('/');

            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (token) {
                await fetch(`${API_BASE_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }).catch(() => { }); // Ignore errors
            }
        } finally {
            // Always clear local state
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
            setUser(null);
            router.push('/login');
        }
    };

    const value = useMemo(() => ({
        user,
        loading,
        error,
        isAuthenticated: !!user,
        login,
        logout,
        checkSession,
    }), [user, loading, error, login, logout, checkSession]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
