const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Generic fetch wrapper with error handling
 * All endpoints are prefixed with /api automatically
 */
async function fetchAPI(endpoint, options = {}) {
    // Ensure all endpoints are prefixed with /api
    const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
    const url = `${API_BASE_URL}${apiEndpoint}`;

    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    };

    // Add auth token if available
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('auth_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }

    try {
        const response = await fetch(url, config);

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
    getAll: () => fetchAPI('/customers'),
    getById: (id) => fetchAPI(`/customers/${id}`),
    create: (data) => fetchAPI('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchAPI(`/customers/${id}`, { method: 'DELETE' }),
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
