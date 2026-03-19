import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ZodError } from 'zod';
import logger from '../utils/logger';

const sendErrorDev = (err: any, req: Request, res: Response) => {
    logger.debug('Error in Dev Mode', err);
    res.status(err.statusCode).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack,
    });
};

const sendErrorProd = (err: any, req: Request, res: Response) => {
    // A) Operational, trusted error: send message to client
    if (err.isOperational) {
        res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
        });
    }
    // B) Programming or other unknown error: don't leak details
    else {
        // 1) Log error using Winston with request context
        logger.error('CRITICAL ERROR:', {
            error: err,
            url: req.originalUrl,
            method: req.method,
            body: req.method !== 'GET' ? req.body : undefined,
            user: (req as any).user?.id
        });

        // 2) Send generic message
        res.status(500).json({
            status: 'error',
            message: 'An internal server error occurred',
        });
    }
};

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Handle Zod Errors specially
    if (err instanceof ZodError) {
        return res.status(400).json({
            status: 'fail',
            message: 'Validation Error',
            errors: err.errors,
        });
    }

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, req, res);
    } else {
        // Create a copy of the error to avoid mutating the original
        let error = { ...err };
        error.message = err.message;
        error.stack = err.stack;
        error.statusCode = err.statusCode || 500;
        error.status = err.status || 'error';
        error.isOperational = err.isOperational || false;

        // Handle specific JWT errors
        if (err.name === 'JsonWebTokenError') {
            error = new AppError('Invalid token. Please log in again!', 401);
        } else if (err.name === 'TokenExpiredError') {
            error = new AppError('Your token has expired! Please log in again.', 401);
        }

        sendErrorProd(error, req, res);
    }
};
