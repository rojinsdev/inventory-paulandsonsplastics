// API client for Planning module
import { fetchAPI } from '../api';

/**
 * Get demand trends for products
 */
export async function getDemandTrends(filters = {}) {
    return fetchAPI('/planning/demand-trends', {
        params: filters
    });
}

/**
 * Get seasonal patterns
 */
export async function getSeasonalPatterns(filters = {}) {
    return fetchAPI('/planning/seasonal-patterns', {
        params: filters
    });
}

/**
 * Get production recommendations
 */
export async function getRecommendations(filters = {}) {
    return fetchAPI('/planning/recommendations', {
        params: filters
    });
}

/**
 * Accept a recommendation
 */
export async function acceptRecommendation(id, adjustedQuantity = null) {
    const body = adjustedQuantity !== null ? { adjusted_quantity: adjustedQuantity } : {};
    return fetchAPI(`/planning/recommendations/${id}/accept`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

/**
 * Reject a recommendation
 */
export async function rejectRecommendation(id, reason = null) {
    const body = reason ? { rejection_reason: reason } : {};
    return fetchAPI(`/planning/recommendations/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

/**
 * Generate recommendations for a target month
 */
export async function generateRecommendations(targetMonth) {
    return fetchAPI('/planning/generate-recommendations', {
        method: 'POST',
        body: JSON.stringify({ target_month: targetMonth }),
    });
}

/**
 * Detect seasonal patterns
 */
export async function detectPatterns(yearsBack = 3) {
    return fetchAPI('/planning/detect-patterns', {
        method: 'POST',
        body: JSON.stringify({ years_back: yearsBack }),
    });
}

/**
 * Refresh all analytics (patterns + recommendations)
 */
export async function refreshAnalytics(targetMonth = null, yearsBack = 3) {
    return fetchAPI('/planning/refresh-analytics', {
        method: 'POST',
        body: JSON.stringify({ target_month: targetMonth, years_back: yearsBack }),
    });
}

/**
 * Get demand forecasts
 */
export async function getForecasts(filters = {}) {
    return fetchAPI('/planning/forecasts', {
        params: filters
    });
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
