import { AppError } from '../AppError';

describe('AppError Utility', () => {
    it('should create an operational error with correct status code', () => {
        const error = new AppError('Test Error', 400);

        expect(error.message).toBe('Test Error');
        expect(error.statusCode).toBe(400);
        expect(error.status).toBe('fail');
        expect(error.isOperational).toBe(true);
    });

    it('should set status to "error" for 500 status code', () => {
        const error = new AppError('Server Error', 500);

        expect(error.status).toBe('error');
    });

    it('should capture stack trace', () => {
        const error = new AppError('Trace Error', 404);

        expect(error.stack).toBeDefined();
    });
});
