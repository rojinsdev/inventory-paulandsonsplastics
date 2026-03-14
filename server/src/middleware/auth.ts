import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { withRetry } from '../utils/supabaseRetries';
import logger from '../utils/logger';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'production_manager';
        factory_id: string | null;
    };
}

/**
 * JWT Authentication Middleware
 * Validates Supabase JWT token and extracts user info
 */
export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'No valid authorization token provided'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token with Supabase (Use with retry for transient network errors)
        const { data: { user }, error } = await withRetry<{ data: { user: any }; error: any }>(
            () => supabase.auth.getUser(token)
        );

        if (error || !user) {
            if (error) {
                // Log expired tokens as warnings instead of errors to avoid red alerts
                const isExpired = error.message?.includes('expired');
                if (isExpired) {
                    logger.warn('Supabase Session Expired:', error.message);
                } else {
                    logger.error('Supabase Auth Error:', error);
                }
            }
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired token'
            });
        }

        // Fetch user profile from database (source of truth for role)
        const { data: profile, error: profileError } = await withRetry<any>(() =>
            supabase
                .from('user_profiles')
                .select('id, email, role, active, name, factory_id')
                .eq('id', user.id)
                .single()
        );

        if (profileError || !profile) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'User profile not found'
            });
        }

        // Check if user is active
        if (!profile.active) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'User account is deactivated'
            });
        }

        // Attach user info to request
        req.user = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            role: profile.role,
            factory_id: profile.factory_id,
        };

        next();
    } catch (error: any) {
        logger.error('Authentication process failed:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authentication failed'
        });
    }
};

/**
 * Role-Based Authorization Middleware Factory
 * Creates middleware that checks if user has required role
 */
export const requireRole = (...allowedRoles: Array<'admin' | 'production_manager'>) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
            });
        }

        next();
    };
};

/**
 * Platform-Specific Authorization
 * Ensures admins only use web, production managers only use mobile
 */
export const requirePlatform = (platform: 'web' | 'mobile') => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required'
            });
        }

        const expectedRole = platform === 'web' ? 'admin' : 'production_manager';

        if (req.user.role !== expectedRole) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `This platform is restricted to ${expectedRole} users only`
            });
        }

        next();
    };
};
