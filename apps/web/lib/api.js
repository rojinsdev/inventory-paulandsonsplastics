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

    // Clean up query parameters if they exist
    let finalUrl = `${API_BASE_URL}${apiEndpoint}`;
    if (finalUrl.includes('?')) {
        const [base, search] = finalUrl.split('?');
        const params = new URLSearchParams(search);
        const cleanParams = new URLSearchParams();
        params.forEach((value, key) => {
            if (value !== 'undefined' && value !== 'null' && value !== '') {
                cleanParams.append(key, value);
            }
        });
        const cleanSearch = cleanParams.toString();
        finalUrl = base + (cleanSearch ? `?${cleanSearch}` : '');
    }

    const url = finalUrl;

    let token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

    const getHeaders = (t) => ({
        'Content-Type': 'application/json',
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...options.headers,
    });

    const config = {
        ...options,
        headers: getHeaders(token),
        cache: 'no-store', // Prevent browser caching
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
            const errorData = await response.json().catch(() => ({}));
            let errorMessage = errorData.message || errorData.error;

            // Handle Zod validation errors (array of issues)
            if (Array.isArray(errorMessage)) {
                errorMessage = errorMessage.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
            } else if (typeof errorMessage === 'object' && errorMessage !== null) {
                errorMessage = JSON.stringify(errorMessage);
            }

            throw new Error(errorMessage || `HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error.message);
        throw error;
    }
}

// ============ MACHINES ============
export const machinesAPI = {
    getAll: (params) => fetchAPI(`/machines${params ? '?' + new URLSearchParams(params) : ''}`),
    getById: (id) => fetchAPI(`/machines/${id}`),
    create: (data) => fetchAPI('/machines', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/machines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/machines/${id}`, { method: 'DELETE' }),
};

// ============ PRODUCTS ============
export const productsAPI = {
    getAll: (params) => fetchAPI(`/products${params ? '?' + new URLSearchParams(params) : ''}`),
    getById: (id) => fetchAPI(`/products/${id}`),
    create: (data) => fetchAPI('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/products/${id}`, { method: 'DELETE' }),
};

// ============ MACHINE-PRODUCTS (DIE MAPPINGS) ============
export const dieMappingsAPI = {
    getAll: (params) => fetchAPI(`/machine-products${params ? '?' + new URLSearchParams(params) : ''}`),
    create: (data) => fetchAPI('/machine-products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/machine-products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/machine-products/${id}`, { method: 'DELETE' }),
};

// ============ INVENTORY ============
export const inventoryAPI = {
    getStock: (params) => fetchAPI(`/inventory/stock${params ? '?' + new URLSearchParams(params) : ''}`),
    getAvailable: (params) => fetchAPI(`/inventory/available${params ? '?' + new URLSearchParams(params) : ''}`),
    getRawMaterials: (params) => fetchAPI(`/inventory/raw-materials${params ? '?' + new URLSearchParams(params) : ''}`),
    createRawMaterial: (data) => fetchAPI('/inventory/raw-materials', { method: 'POST', body: JSON.stringify(data) }),
    updateRawMaterial: (id, data) => fetchAPI(`/inventory/raw-materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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
    processDelivery: (id, data) => fetchAPI(`/orders/${id}/process-delivery`, { method: 'POST', body: JSON.stringify(data) }),
    recordPayment: (id, data) => fetchAPI(`/orders/${id}/record-payment`, { method: 'POST', body: JSON.stringify(data) }),
    getCustomerPaymentHistory: (customerId) => fetchAPI(`/orders/customers/${customerId}/payment-history`),
    getPendingPayments: (params) => fetchAPI(`/orders/pending-payments${params ? '?' + new URLSearchParams(params) : ''}`),
};

// ============ PRODUCTION ============
export const productionAPI = {
    getLogs: (params) => fetchAPI(`/production/logs${params ? '?' + new URLSearchParams(params) : ''}`),
    getDashboard: () => fetchAPI('/production/dashboard'),
    getRequests: (params) => fetchAPI(`/production/requests${params ? '?' + new URLSearchParams(params) : ''}`),
    updateRequestStatus: (id, status) => fetchAPI(`/production/requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
    }),
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
    activate: (id) => fetchAPI(`/auth/users/${id}/activate`, { method: 'PATCH' }),
    deactivate: (id) => fetchAPI(`/auth/users/${id}/deactivate`, { method: 'PATCH' }),
};

// ============ FACTORIES ============
export const factoriesAPI = {
    getAll: () => fetchAPI('/factories'),
    getById: (id) => fetchAPI(`/factories/${id}`),
    create: (data) => fetchAPI('/factories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/factories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    toggle: (id, active) => fetchAPI(`/factories/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    delete: (id) => fetchAPI(`/factories/${id}`, { method: 'DELETE' }),
    getStats: (id) => fetchAPI(`/factories/${id}/stats`),
};

// ============ CAPS ============
export const capsAPI = {
    getAll: (params) => fetchAPI(`/caps${params ? '?' + new URLSearchParams(params) : ''}`),
    getById: (id) => fetchAPI(`/caps/${id}`),
    create: (data) => fetchAPI('/caps', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/caps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/caps/${id}`, { method: 'DELETE' }),

    // Cap Production
    getProductionLogs: (params) => fetchAPI(`/production/caps/logs${params ? '?' + new URLSearchParams(params) : ''}`),
    submitProduction: (data) => fetchAPI('/production/caps/submit', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ CASH FLOW ============
export const cashFlowAPI = {
    getDailySheet: (params) => fetchAPI(`/cash-flow/daily${params ? '?' + new URLSearchParams(params) : ''}`),
    getAnalytics: (params) => fetchAPI(`/cash-flow/analytics${params ? '?' + new URLSearchParams(params) : ''}`),
    logEntry: (data) => fetchAPI('/cash-flow/entry', { method: 'POST', body: JSON.stringify(data) }),
    getCategories: () => fetchAPI('/cash-flow/categories'),
    createCategory: (data) => fetchAPI('/cash-flow/categories', { method: 'POST', body: JSON.stringify(data) }),
    updateCategory: (id, data) => fetchAPI(`/cash-flow/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCategory: (id) => fetchAPI(`/cash-flow/categories/${id}`, { method: 'DELETE' }),
};
