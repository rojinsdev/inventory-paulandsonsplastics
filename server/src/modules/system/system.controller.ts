import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { AppError } from '../../utils/AppError';
import logger from '../../utils/logger';
import { AuthRequest } from '../../middleware/auth';

export class SystemController {
    /**
     * Get system health summary
     */
    async getHealthSummary(req: AuthRequest, res: Response) {
        try {
            const { data: healthData, error } = await supabase.rpc('get_system_health_summary');
            
            if (error) {
                logger.error('Failed to get system health summary:', error);
                throw new AppError('Failed to get system health data', 500);
            }

            res.json(healthData);
        } catch (error: any) {
            logger.error('System health summary error:', error);
            res.status(500).json({ 
                error: 'Failed to get system health summary',
                message: error.message 
            });
        }
    }

    /**
     * Get recent system errors
     */
    async getRecentErrors(req: AuthRequest, res: Response) {
        try {
            const hours = parseInt(req.query.hours as string) || 24;
            const limit = parseInt(req.query.limit as string) || 50;

            const { data: errorsData, error } = await supabase.rpc('get_recent_errors_summary', {
                p_hours_back: hours,
                p_limit: limit
            });
            
            if (error) {
                logger.error('Failed to get recent errors:', error);
                throw new AppError('Failed to get error data', 500);
            }

            res.json(errorsData);
        } catch (error: any) {
            logger.error('Recent errors fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to get recent errors',
                message: error.message 
            });
        }
    }

    /**
     * Validate stock consistency
     */
    async validateStockConsistency(req: AuthRequest, res: Response) {
        try {
            const productId = req.query.product_id as string;
            const factoryId = req.query.factory_id as string;

            const { data: validationData, error } = await supabase.rpc('validate_stock_consistency', {
                p_product_id: productId || null,
                p_factory_id: factoryId || null
            });
            
            if (error) {
                logger.error('Failed to validate stock consistency:', error);
                throw new AppError('Failed to validate stock', 500);
            }

            res.json(validationData);
        } catch (error: any) {
            logger.error('Stock validation error:', error);
            res.status(500).json({ 
                error: 'Failed to validate stock consistency',
                message: error.message 
            });
        }
    }

    /**
     * Validate order consistency
     */
    async validateOrderConsistency(req: AuthRequest, res: Response) {
        try {
            const orderId = req.params.orderId;

            if (!orderId) {
                throw new AppError('Order ID is required', 400);
            }

            const { data: validationData, error } = await supabase.rpc('validate_order_items_consistency', {
                p_order_id: orderId
            });
            
            if (error) {
                logger.error('Failed to validate order consistency:', error);
                throw new AppError('Failed to validate order', 500);
            }

            res.json(validationData);
        } catch (error: any) {
            logger.error('Order validation error:', error);
            res.status(500).json({ 
                error: 'Failed to validate order consistency',
                message: error.message 
            });
        }
    }

    /**
     * Resolve a system error
     */
    async resolveError(req: AuthRequest, res: Response) {
        try {
            const errorId = req.params.errorId;
            const { resolution_notes } = req.body;

            if (!errorId) {
                throw new AppError('Error ID is required', 400);
            }

            const { data: resolved, error } = await supabase.rpc('resolve_system_error', {
                p_error_id: errorId,
                p_resolution_notes: resolution_notes || null
            });
            
            if (error) {
                logger.error('Failed to resolve error:', error);
                throw new AppError('Failed to resolve error', 500);
            }

            if (!resolved) {
                throw new AppError('Error not found or already resolved', 404);
            }

            logger.info('System error resolved', { 
                errorId, 
                resolvedBy: req.user?.id, 
                notes: resolution_notes 
            });

            res.json({ 
                success: true, 
                message: 'Error resolved successfully',
                errorId 
            });
        } catch (error: any) {
            logger.error('Error resolution failed:', error);
            res.status(error.statusCode || 500).json({ 
                error: 'Failed to resolve error',
                message: error.message 
            });
        }
    }

    /**
     * Log a system error (for internal use)
     */
    async logError(errorType: string, functionName: string, errorMessage: string, context?: any, userId?: string, orderId?: string) {
        try {
            const { data: logId, error } = await supabase.rpc('log_system_error', {
                p_error_type: errorType,
                p_function_name: functionName,
                p_error_message: errorMessage,
                p_error_context: context ? JSON.stringify(context) : null,
                p_user_id: userId || null,
                p_order_id: orderId || null,
                p_stack_trace: null // Could be enhanced to include stack traces
            });
            
            if (error) {
                logger.error('Failed to log system error:', error);
            } else {
                logger.info('System error logged', { logId, errorType, functionName });
            }

            return logId;
        } catch (error: any) {
            logger.error('Error logging failed:', error);
        }
    }

    /**
     * Get system dashboard data (combined health + errors)
     */
    async getDashboardData(req: AuthRequest, res: Response) {
        try {
            // Get health summary and recent errors in parallel
            const [healthResult, errorsResult] = await Promise.all([
                supabase.rpc('get_system_health_summary'),
                supabase.rpc('get_recent_errors_summary', { p_hours_back: 24, p_limit: 10 })
            ]);

            if (healthResult.error) {
                logger.error('Failed to get health data:', healthResult.error);
            }

            if (errorsResult.error) {
                logger.error('Failed to get errors data:', errorsResult.error);
            }

            const dashboardData = {
                health: healthResult.data || null,
                errors: errorsResult.data || null,
                timestamp: new Date().toISOString()
            };

            res.json(dashboardData);
        } catch (error: any) {
            logger.error('Dashboard data fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to get dashboard data',
                message: error.message 
            });
        }
    }
}

export const systemController = new SystemController();