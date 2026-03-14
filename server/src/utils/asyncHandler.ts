import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async express middleware/controller function 
 * and catches any errors to pass them to the global error handler.
 */
export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
};
