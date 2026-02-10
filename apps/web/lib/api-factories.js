// ============ FACTORIES ============
export const factoriesAPI = {
    getAll: () => fetchAPI('/factories'),
    getById: (id) => fetchAPI(`/factories/${id}`),
    getStats: (id) => fetchAPI(`/factories/${id}/stats`),
    create: (data) => fetchAPI('/factories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchAPI(`/factories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    toggleStatus: (id) => fetchAPI(`/factories/${id}/toggle`, { method: 'PATCH' }),
    delete: (id) => fetchAPI(`/factories/${id}`, { method: 'DELETE' }),
};
