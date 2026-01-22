// API client for Planning module

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/api` : 'http://localhost:4000/api');

/**
 * Get demand trends for products
 */
export async function getDemandTrends(filters = {}) {
    const token = localStorage.getItem('auth_token');
    const params = new URLSearchParams();

    if (filters.period) params.append('period', filters.period);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.product_id) params.append('product_id', filters.product_id);

    const response = await fetch(`${API_BASE_URL}/planning/demand-trends?${params}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch demand trends: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get seasonal patterns
 */
export async function getSeasonalPatterns(filters = {}) {
    const token = localStorage.getItem('auth_token');
    const params = new URLSearchParams();

    if (filters.product_id) params.append('product_id', filters.product_id);
    if (filters.confidence_min) params.append('confidence_min', filters.confidence_min.toString());
    if (filters.is_active !== undefined) params.append('is_active', filters.is_active.toString());

    const response = await fetch(`${API_BASE_URL}/planning/seasonal-patterns?${params}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch seasonal patterns: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get production recommendations
 */
export async function getRecommendations(filters = {}) {
    const token = localStorage.getItem('auth_token');
    const params = new URLSearchParams();

    if (filters.target_month) params.append('target_month', filters.target_month);
    if (filters.status) params.append('status', filters.status);
    if (filters.product_id) params.append('product_id', filters.product_id);
    if (filters.confidence_min) params.append('confidence_min', filters.confidence_min.toString());

    const response = await fetch(`${API_BASE_URL}/planning/recommendations?${params}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch recommendations: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Accept a recommendation
 */
export async function acceptRecommendation(id, adjustedQuantity = null) {
    const token = localStorage.getItem('auth_token');
    const body = adjustedQuantity !== null ? { adjusted_quantity: adjustedQuantity } : {};

    const response = await fetch(`${API_BASE_URL}/planning/recommendations/${id}/accept`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Failed to accept recommendation: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Reject a recommendation
 */
export async function rejectRecommendation(id, reason = null) {
    const token = localStorage.getItem('auth_token');
    const body = reason ? { rejection_reason: reason } : {};

    const response = await fetch(`${API_BASE_URL}/planning/recommendations/${id}/reject`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Failed to reject recommendation: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Generate recommendations for a target month
 */
export async function generateRecommendations(targetMonth) {
    const token = localStorage.getItem('auth_token');

    const response = await fetch(`${API_BASE_URL}/planning/generate-recommendations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_month: targetMonth }),
    });

    if (!response.ok) {
        throw new Error(`Failed to generate recommendations: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Detect seasonal patterns
 */
export async function detectPatterns(yearsBack = 3) {
    const token = localStorage.getItem('auth_token');

    const response = await fetch(`${API_BASE_URL}/planning/detect-patterns`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ years_back: yearsBack }),
    });

    if (!response.ok) {
        throw new Error(`Failed to detect patterns: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Refresh all analytics (patterns + recommendations)
 */
export async function refreshAnalytics(targetMonth = null, yearsBack = 3) {
    const token = localStorage.getItem('auth_token');

    const response = await fetch(`${API_BASE_URL}/planning/refresh-analytics`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_month: targetMonth, years_back: yearsBack }),
    });

    if (!response.ok) {
        throw new Error(`Failed to refresh analytics: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get demand forecasts
 */
export async function getForecasts(filters = {}) {
    const token = localStorage.getItem('auth_token');
    const params = new URLSearchParams();

    if (filters.product_id) params.append('product_id', filters.product_id);
    if (filters.forecast_method) params.append('forecast_method', filters.forecast_method);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);

    const response = await fetch(`${API_BASE_URL}/planning/forecasts?${params}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch forecasts: ${response.statusText}`);
    }

    return response.json();
}

export const planningAPI = {
    getDemandTrends,
    getSeasonalPatterns,
    getRecommendations,
    acceptRecommendation,
    rejectRecommendation,
    generateRecommendations,
    detectPatterns,
    refreshAnalytics,
    getForecasts,
};
