import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Vendor {
    id: string;
    email: string;
    phone?: string;
    store?: {
        id: string;
        name: string;
        slug: string;
    };
}

interface AuthContextType {
    vendor: Vendor | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (token: string, vendor: Vendor) => void;
    signup: (token: string, vendor: Vendor) => void;
    logout: () => void;
    refreshVendor: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize from localStorage
    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedVendor = localStorage.getItem('vendor');

        if (storedToken && storedVendor) {
            setToken(storedToken);
            setVendor(JSON.parse(storedVendor));
        }

        setIsLoading(false);
    }, []);

    const login = (newToken: string, newVendor: Vendor) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('vendor', JSON.stringify(newVendor));
        setToken(newToken);
        setVendor(newVendor);
    };

    const signup = (newToken: string, newVendor: Vendor) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('vendor', JSON.stringify(newVendor));
        setToken(newToken);
        setVendor(newVendor);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('vendor');
        setToken(null);
        setVendor(null);
    };

    const refreshVendor = async () => {
        if (!token) return;
        try {
            // In a real app, we'd have a /me endpoint or similar.
            // For now, we rely on the initial login response or store creation response
            // to update the vendor state if needed (e.g. after creating a store).
            // If we implement GET /api/store, we can fetch store details here.

            const response = await api.get('/api/store').catch(() => null);
            if (response && response.data) {
                setVendor(prev => prev ? { ...prev, store: response.data } : null);
                if (vendor) {
                    localStorage.setItem('vendor', JSON.stringify({ ...vendor, store: response.data }));
                }
            }
        } catch (error) {
            console.error("Failed to refresh vendor data", error);
        }
    };

    return (
        <AuthContext.Provider value={{
            vendor,
            token,
            isAuthenticated: !!token,
            isLoading,
            login,
            signup,
            logout,
            refreshVendor
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
