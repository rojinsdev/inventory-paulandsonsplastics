import { dashboardService } from '../dashboard/dashboard.service';
import { planningService } from '../planning/planning.service';

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
    async getActiveNotifications(factoryId?: string): Promise<NotificationItem[]> {
        const today = new Date().toISOString().split('T')[0];
        const notifications: NotificationItem[] = [];

        try {
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
