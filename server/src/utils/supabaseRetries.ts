/**
 * Utility to retry asynchronous functions with exponential backoff.
 * Specifically useful for handling transient network errors/timeouts with Supabase.
 */

interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    shouldRetry?: (error: any) => boolean;
}

export const withRetry = async <T>(
    fn: () => PromiseLike<T>,
    options: RetryOptions = {}
): Promise<T> => {
    const {
        maxRetries = 3,
        initialDelay = 500,
        maxDelay = 10000,
        factor = 2,
        shouldRetry = (error: any) => {
            // Retry on connection timeouts and other transient network errors
            const errorCode = error?.code || error?.cause?.code;
            return (
                errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
                errorCode === 'ECONNRESET' ||
                errorCode === 'ETIMEDOUT' ||
                error?.message?.includes('fetch failed')
            );
        },
    } = options;

    let lastError: any;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            if (attempt === maxRetries || !shouldRetry(error)) {
                throw error;
            }

            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * factor, maxDelay);
        }
    }

    throw lastError;
};
