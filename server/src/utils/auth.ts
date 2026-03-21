import { AuthRequest } from '../middleware/auth';

/**
 * Resolves the factory ID for filtering based on the user's role and request parameters.
 * 
 * - For production_manager: Always returns their assigned factory_id, ignoring query params.
 * - For admin: Returns factory_id from query params if provided.
 */
export function resolveAuthorizedFactoryId(req: AuthRequest): string | undefined {
    if (!req.user) return undefined;

    if (req.user.role === 'production_manager') {
        return req.user.factory_id || undefined;
    }

    // Admins can filter by query param, or see all if none provided
    return req.query.factory_id as string | undefined;
}
