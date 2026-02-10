/**
 * Format a number as Indian Rupees
 */
export function formatCurrency(value) {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(value);
}

/**
 * Format a date string
 */
export function formatDate(dateString, options = {}) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...options,
    });
}

/**
 * Format a date with time
 */
export function formatDateTime(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(value) {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-IN').format(value);
}

/**
 * Truncate a UUID for display
 */
export function truncateId(id) {
    if (!id) return '—';
    return id.substring(0, 8).toUpperCase();
}

/**
 * Get status badge color
 */
export function getStatusColor(status) {
    const statusColors = {
        active: 'success',
        inactive: 'gray',
        reserved: 'warning',
        delivered: 'success',
        cancelled: 'error',
        pending: 'warning',
        draft: 'gray',
        submitted: 'primary',
        verified: 'success',
    };
    return statusColors[status?.toLowerCase()] || 'gray';
}

/**
 * Debounce function
 */
export function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Capitalize first letter
 */
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Get current date in YYYY-MM-DD format (Local Time)
 */
export function getLocalDateISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Class name helper (like classnames/clsx)
 */
export function cn(...classes) {
    return classes.filter(Boolean).join(' ');
}
