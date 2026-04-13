import { dashboardService } from '../dashboard/dashboard.service';
import { planningService } from '../planning/planning.service';
import { supabase } from '../../config/supabase';

export interface NotificationItem {
    id: string;
    type: 'stock' | 'order' | 'plan' | 'machine';
    title: string;
    message: string;
    timestamp: string;
    severity: 'info' | 'warning' | 'critical';
    link: string;
}

export class NotificationService {
    private linkForDbRow(type: string, metadata: Record<string, unknown> | null): string {
        const oid = metadata && typeof metadata.order_id === 'string' ? metadata.order_id : null;
        if (oid) return '/orders';
        if (type === 'backorder_fulfillment') return '/deliveries';
        if (type === 'sales_order_preparation') return '/orders';
        return '/';
    }

    private severityForDbType(type: string): 'info' | 'warning' | 'critical' {
        if (type.includes('overdue') || type.includes('alert')) return 'critical';
        if (type.includes('stock') || type.includes('low')) return 'warning';
        return 'info';
    }

    private mapDbTypeToUi(type: string): NotificationItem['type'] {
        if (type.includes('order') || type.includes('sales') || type.includes('backorder')) return 'order';
        if (type.includes('machine')) return 'machine';
        if (type.includes('plan')) return 'plan';
        if (type.includes('stock')) return 'stock';
        return 'order';
    }

    async getActiveNotifications(factoryId?: string, userId?: string): Promise<NotificationItem[]> {
        const today = new Date().toISOString().split('T')[0];
        const notifications: NotificationItem[] = [];

        try {
            if (userId) {
                const { data: rows, error: dbErr } = await supabase
                    .from('notifications')
                    .select('id, title, message, type, created_at, metadata, is_read')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(40);

                if (dbErr) {
                    console.error('Error loading user notifications from DB:', dbErr);
                } else if (rows?.length) {
                    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
                    for (const row of rows) {
                        const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
                        if (ts < cutoff) continue;
                        if (row.is_read) continue;
                        notifications.push({
                            id: `db-${row.id}`,
                            type: this.mapDbTypeToUi(row.type || ''),
                            title: row.title,
                            message: row.message,
                            timestamp: row.created_at || new Date().toISOString(),
                            severity: this.severityForDbType(row.type || ''),
                            link: this.linkForDbRow(row.type || '', (row.metadata as Record<string, unknown>) || {})
                        });
                    }
                }
            }
            // 1. Get Dashboard Alerts (Stock, Machines, Orders)
            const alerts = await dashboardService.getAlerts(today);

            // Process Low Stock
            alerts.lowStock.forEach(item => {
                notifications.push({
                    id: `stock-${item.materialId}`,
                    type: 'stock',
                    title: 'Low Stock Alert',
                    message: `${item.name} is at ${item.currentStock}kg (Threshold: ${item.threshold}kg)`,
                    timestamp: new Date().toISOString(),
                    severity: 'critical',
                    link: '/inventory/live'
                });
            });

            // Process Machines Needing Attention
            alerts.machinesNeedingAttention.forEach(item => {
                notifications.push({
                    id: `machine-${item.machineId}`,
                    type: 'machine',
                    title: 'Machine Attention Required',
                    message: `${item.name} is ${item.status === 'maintenance' ? 'in maintenance' : `running at low efficiency (${item.efficiency}%)`}`,
                    timestamp: new Date().toISOString(),
                    severity: 'critical',
                    link: '/machines'
                });
            });

            // Process Pending Orders
            alerts.pendingOrders.forEach(item => {
                notifications.push({
                    id: `order-${item.orderId}`,
                    type: 'order',
                    title: 'Delayed Order',
                    message: `Order for ${item.customerName} has been pending for ${item.daysPending} days`,
                    timestamp: new Date().toISOString(),
                    severity: item.daysPending > 3 ? 'critical' : 'warning',
                    link: '/orders'
                });
            });

            // 2. Get Planning Recommendations
            const planningData = await planningService.getRecommendations({ status: 'pending' });
            planningData.recommendations.forEach(rec => {
                notifications.push({
                    id: `plan-${rec.id}`,
                    type: 'plan',
                    title: 'New Production Plan',
                    message: `Recommended: ${rec.recommended_quantity} units of ${rec.product_name}`,
                    timestamp: rec.created_at || new Date().toISOString(),
                    severity: 'info',
                    link: '/reports/production'
                });
            });

        } catch (error) {
            console.error('Error fetching notifications:', error);
        }

        // Sort by severity (critical first) and then timestamp
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return notifications.sort((a, b) => {
            if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                return severityOrder[a.severity] - severityOrder[b.severity];
            }
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
    }
}

export const notificationService = new NotificationService();
