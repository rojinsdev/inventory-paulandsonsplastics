const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Helper to refresh the access token
 */
async function refreshToken() {
    if (typeof window === 'undefined') return null;

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return null;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
            throw new Error('Refresh failed');
        }

        const data = await response.json();
        const newAccessToken = data.session?.access_token;
        const newRefreshToken = data.session?.refresh_token;
        const newExpiresAt = data.session?.expires_at;

        if (newAccessToken) {
            localStorage.setItem('auth_token', newAccessToken);
            if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken);
            if (newExpiresAt) localStorage.setItem('expires_at', newExpiresAt);
            return newAccessToken;
        }
    } catch (error) {
        console.error('Token refresh error:', error);
        // Clear session on fatal refresh error
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('expires_at');
        localStorage.removeItem('user');
        window.location.href = '/login';
    }
    return null;
}

/**
 * Generic fetch wrapper with error handling and auto-refresh
 * All endpoints are prefixed with /api automatically
 */
async function fetchAPI(endpoint, options = {}) {
    // Ensure all endpoints are prefixed with /api
    const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
    const url = `${API_BASE_URL}${apiEndpoint}`;

    let token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

    const getHeaders = (t) => ({
        'Content-Type': 'application/json',
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...options.headers,
    });

    const config = {
        ...options,
        headers: getHeaders(token),
    };

    try {
        let response = await fetch(url, config);

        // Handle 401 Unauthorized - Attempt Refresh
        if (response.status === 401) {
            console.warn(`401 Unauthorized on ${endpoint}. Attempting token refresh...`);
            token = await refreshToken();

            if (token) {
                // Retry request with new token
                config.headers = getHeaders(token);
                response = await fetch(url, config);
            } else {
                // Refresh failed, redirect handled in refreshToken
                throw new Error('Session expired. Please login again.');
            }
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error.message);
        throw error;
    }
}

// ============ MACHINES ============
export const machinesAPI = {
    getAll: () => fetchAPI('/machines'),
    getById: (id) => fetchAPI(`/machines/${id}`),
    create: (data) => fetchAPI('/machines', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/machines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/machines/${id}`, { method: 'DELETE' }),
};

// ============ PRODUCTS ============
export const productsAPI = {
    getAll: () => fetchAPI('/products'),
    getById: (id) => fetchAPI(`/products/${id}`),
    create: (data) => fetchAPI('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/products/${id}`, { method: 'DELETE' }),
};

// ============ MACHINE-PRODUCTS (DIE MAPPINGS) ============
export const dieMappingsAPI = {
    getAll: () => fetchAPI('/machine-products'),
    create: (data) => fetchAPI('/machine-products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/machine-products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/machine-products/${id}`, { method: 'DELETE' }),
};

// ============ INVENTORY ============
export const inventoryAPI = {
    getStock: () => fetchAPI('/inventory/stock'),
    getAvailable: () => fetchAPI('/inventory/available'),
    getRawMaterials: () => fetchAPI('/inventory/raw-materials'),
    createRawMaterial: (data) => fetchAPI('/inventory/raw-materials', { method: 'POST', body: JSON.stringify(data) }),
    adjustStock: (data) => fetchAPI('/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
    adjustRawMaterial: (id, data) => fetchAPI(`/inventory/raw-materials/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
    getTransactions: (params) => fetchAPI(`/inventory/transactions${params ? '?' + new URLSearchParams(params) : ''}`),
};

// ============ CUSTOMERS ============
export const customersAPI = {
    // Basic CRUD
    getAll: () => fetchAPI('/customers'),
    getById: (id) => fetchAPI(`/customers/${id}`),
    create: (data) => fetchAPI('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/customers/${id}`, { method: 'DELETE' }),

    // Profile & Analytics
    getProfile: (id) => fetchAPI(`/customers/${id}/profile`),
    getAnalytics: (id) => fetchAPI(`/customers/${id}/analytics`),
    getPurchaseHistory: (id, params) => fetchAPI(`/customers/${id}/purchase-history${params ? '?' + new URLSearchParams(params) : ''}`),

    // Interactions
    getInteractions: (id, params) => fetchAPI(`/customers/${id}/interactions${params ? '?' + new URLSearchParams(params) : ''}`),
    addInteraction: (id, data) => fetchAPI(`/customers/${id}/interactions`, { method: 'POST', body: JSON.stringify(data) }),

    // Segmentation
    getBySegment: (segment) => fetchAPI(`/customers/segments/${segment}`),
    getVIP: (limit = 50) => fetchAPI(`/customers/vip/list?limit=${limit}`),
    getAtRisk: (limit = 50) => fetchAPI(`/customers/at-risk/list?limit=${limit}`),
    getStats: () => fetchAPI('/customers/stats/overview'),
};

// ============ ORDERS ============
export const ordersAPI = {
    getAll: (params) => fetchAPI(`/orders${params ? '?' + new URLSearchParams(params) : ''}`),
    getById: (id) => fetchAPI(`/orders/${id}`),
    create: (data) => fetchAPI('/orders', { method: 'POST', body: JSON.stringify(data) }),
    deliver: (id) => fetchAPI(`/orders/${id}/deliver`, { method: 'PUT' }),
    cancel: (id) => fetchAPI(`/orders/${id}/cancel`, { method: 'PUT' }),
};

// ============ PRODUCTION ============
export const productionAPI = {
    getLogs: (params) => fetchAPI(`/production/logs${params ? '?' + new URLSearchParams(params) : ''}`),
    getDashboard: () => fetchAPI('/production/dashboard'),
};

// ============ DASHBOARD ============
export const dashboardAPI = {
    getStats: () => fetchAPI('/dashboard/stats'),
    getComprehensive: (params) => fetchAPI(`/dashboard/comprehensive${params ? '?' + new URLSearchParams(params) : ''}`),
};

// ============ ANALYTICS ============
export const analyticsAPI = {
    getSummary: (params) => fetchAPI(`/analytics/summary${params ? '?' + new URLSearchParams(params) : ''}`),
    getCycleTimeLoss: (params) => fetchAPI(`/analytics/cycle-time-loss${params ? '?' + new URLSearchParams(params) : ''}`),
    getWeightWastage: (params) => fetchAPI(`/analytics/weight-wastage${params ? '?' + new URLSearchParams(params) : ''}`),
    getDowntimeBreakdown: (params) => fetchAPI(`/analytics/downtime-breakdown${params ? '?' + new URLSearchParams(params) : ''}`),
    getMachineEfficiency: (params) => fetchAPI(`/analytics/machine-efficiency${params ? '?' + new URLSearchParams(params) : ''}`),
    getShiftComparison: (params) => fetchAPI(`/analytics/shift-comparison${params ? '?' + new URLSearchParams(params) : ''}`),
};

// ============ REPORTS ============
export const reportsAPI = {
    getProduction: (params) => fetchAPI(`/reports/production${params ? '?' + new URLSearchParams(params) : ''}`),
    getInventory: (params) => fetchAPI(`/reports/inventory${params ? '?' + new URLSearchParams(params) : ''}`),
    getSales: (params) => fetchAPI(`/reports/sales${params ? '?' + new URLSearchParams(params) : ''}`),
};

// ============ SETTINGS ============
export const settingsAPI = {
    get: () => fetchAPI('/settings'),
    getByCategory: (category) => fetchAPI(`/settings/category/${category}`),
    getValue: (key) => fetchAPI(`/settings/value/${key}`),
    updateValue: (key, value) => fetchAPI(`/settings/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) }),
    update: (data) => fetchAPI('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

// ============ AUDIT ============
export const auditAPI = {
    getLogs: (params) => fetchAPI(`/audit-logs${params ? '?' + new URLSearchParams(params) : ''}`),
};

// ============ AUTH ============
export const authAPI = {
    login: (email, password) => fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    }),
    logout: () => fetchAPI('/auth/logout', { method: 'POST' }),
    getSession: () => fetchAPI('/auth/session'),
};

// ============ USERS (Production Managers) ============
export const usersAPI = {
    getAll: () => fetchAPI('/auth/users'),
    getById: (id) => fetchAPI(`/auth/users/${id}`),
    create: (data) => fetchAPI('/auth/users', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    update: (id, data) => fetchAPI(`/auth/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    activate: (id) => fetchAPI(`/auth/users/${id}/activate`, { method: 'PATCH' }),
    deactivate: (id) => fetchAPI(`/auth/users/${id}/deactivate`, { method: 'PATCH' }),
};
