// Utility for resolving backend API Base URL
// Priority:
// 1. VITE_API_BASE_URL from .env (e.g. from Google Colab Cloudflare tunnel)
// 2. Production / Cloudflare host (relative '/api')
// 3. Local development fallback ('http://localhost:8000/api')

export const getApiBaseUrl = () => {
  const envUrl = import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_API_URL || import.meta.env?.VITE_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const clean = envUrl.trim().replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '/api';
  }
  return 'http://localhost:8000/api';
};

export const API_BASE_URL = getApiBaseUrl();
export default API_BASE_URL;
