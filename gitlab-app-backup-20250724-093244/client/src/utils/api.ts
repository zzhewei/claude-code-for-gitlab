import axios from 'axios';
import { ApiError } from '../types';

export const api = axios.create({
  baseURL: import.meta.env.PROD ? '' : 'http://localhost:3000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login if not authenticated
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/auth/gitlab';
      }
    }
    
    // Transform error to standard format
    const apiError: ApiError = {
      error: error.response?.data?.error || error.message || 'An error occurred',
      details: error.response?.data?.details,
    };
    
    return Promise.reject(apiError);
  }
);

export default api;