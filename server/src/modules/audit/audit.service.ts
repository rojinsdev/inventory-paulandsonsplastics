import { supabase } from '../../config/supabase';

export class AuditService {

    /**
     * Log an action in the system
     */
    async logAction(
        userId: string,
        action: string,
        entityType: string,
        entityId?: string,
        details?: any,
        ipAddress?: string
    ) {
        const { error } = await supabase
            .from('audit_logs')
            .insert({
                user_id: userId,
                action,
                entity_type: entityType,
                entity_id: entityId,
                details,
                ip_address: ipAddress
            });

        if (error) {
            console.error('Failed to create audit log:', error);
            // Don't throw, we don't want to block the main action if logging fails
        }
    }

    /**
     * Get audit logs with filtering and pagination
     */
    async getLogs(page = 1, limit = 50, filters: any = {}) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('audit_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        // Apply filters
        if (filters.action) {
            query = query.eq('action', filters.action);
        }
        if (filters.entity_type) {
            query = query.eq('entity_type', filters.entity_type);
        }
        if (filters.date_from) {
            query = query.gte('created_at', filters.date_from);
        }
        if (filters.date_to) {
            // Add time to end of day
            const dateTo = new Date(filters.date_to);
            dateTo.setHours(23, 59, 59, 999);
            query = query.lte('created_at', dateTo.toISOString());
        }

        const { data: logs, count, error } = await query;

        if (error) throw error;

        // Enrich with user details manually since we can't easily join on auth.users/user_profiles via simple client queries without explicit FKs
        if (logs && logs.length > 0) {
            const userIds = [...new Set(logs.map(log => log.user_id).filter(Boolean))];

            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('user_profiles')
                    .select('id, email, name')
                    .in('id', userIds);

                const profileMap = (profiles || []).reduce((acc, profile) => {
                    acc[profile.id] = profile;
                    return acc;
                }, {} as any);

                return {
                    data: logs.map(log => ({
                        ...log,
                        user_name: profileMap[log.user_id]?.name || 'Unknown',
                        user_email: profileMap[log.user_id]?.email || 'Unknown'
                    })),
                    total: count
                };
            }
        }

        return { data: logs || [], total: count || 0 };
    }
}
