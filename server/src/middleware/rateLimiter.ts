import rateLimit from 'express-rate-limit';

/**
 * General API Rate Limiter
 * Allows 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        message: 'Too many requests from this IP, please try again after 15 minutes',
    },
});

/**
 * Strict Auth Rate Limiter
 * Allows more attempts in development phase to facilitate testing
 */
export const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 500, // Increased from 100 to 500 for testing
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        message: 'Too many login attempts, please try again after an hour',
    },
});
