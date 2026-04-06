
/**
 * Date utility for consistent local date handling (Asia/Kolkata)
 */
export function getIsoLocalDate(date: Date = new Date()): string {
    // We use en-CA because it naturally formats as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Kolkata'
    }).format(date);
}

/**
 * Get start of current week (Monday) in local date
 */
export function getStartOfLocalWeek(): string {
    const now = new Date();
    // Get the local day of the week (Sun=0, Mon=1, etc.)
    const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const localDayStr = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(now);
    const localDay = dayMap[localDayStr];
    
    // We want Monday as start.
    const diff = now.getDate() - (localDay === 0 ? 6 : localDay - 1);
    const monday = new Date(now.setDate(diff));
    return getIsoLocalDate(monday);
}
