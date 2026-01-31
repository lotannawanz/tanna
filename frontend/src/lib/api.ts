import axios from 'axios';

// Base URL for the backend API
// In production, this would come from import.meta.env.VITE_API_URL
const API_URL = 'http://localhost:3000';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add JWT token to headers
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Public API endpoints
export const publicApi = {
    getProduct: async (storeSlug: string, productSlug: string) => {
        const response = await api.get(`/api/public/store/${storeSlug}/product/${productSlug}`);
        return response.data;
    },

    checkout: async (data: {
        productSlug: string;
        storeSlug: string;
        buyerPhone: string;
        buyerEmail?: string;
        callbackUrl?: string;
    }) => {
        const response = await api.post('/api/public/checkout', data);
        return response.data;
    }
};
