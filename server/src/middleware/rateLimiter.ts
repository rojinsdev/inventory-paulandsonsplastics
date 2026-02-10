import rateLimit from 'express-rate-limit';

/**
 * General API Rate Limiter
 * Allows 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        message: 'Too many requests from this IP, please try again after 15 minutes',
    },
});

/**
 * Strict Auth Rate Limiter
 * Allows 5 login attempts per hour per IP to prevent brute-force
 */
export const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        message: 'Too many login attempts from this IP, please try again after an hour',
    },
});
