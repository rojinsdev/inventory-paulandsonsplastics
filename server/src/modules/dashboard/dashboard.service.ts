import { supabase } from '../../config/supabase';

export interface DashboardStats {
    todaysProduction: number;
    activeMachines: number;
    pendingOrders: number;
    lowStockAlerts: number;
}

export interface ComprehensiveDashboardData {
    production: {
        today: number;
        thisWeek: number;
        averageEfficiency: number;
        costRecoveredMachines: number;
        activeMachines: number;
        totalMachines: number;
    };
    inventory: {
        totalStockValue: number;
        finishedGoods: number;
        lowStockAlerts: number;
        rawMaterialStock: number;
        byState: {
            semi_finished: number;
            packed: number;
            finished: number;
            reserved: number;
            delivered: number;
        };
    };
    sales: {
        pendingOrders: number;
        todayDeliveries: number;
        thisWeekRevenue: number;
        activeCustomers: number;
    };
    productionTrends: Array<{
        date: string;
        actual: number;
        theoretical: number;
        efficiency: number;
    }>;
    machinePerformance: Array<{
        machineId: string;
        name: string;
        efficiency: number;
        status: string;
    }>;
    salesTrends: Array<{
        date: string;
        orders: number;
        revenue: number;
    }>;
    recentActivity: Array<{
        type: string;
        description: string;
        timestamp: string;
        user?: string;
    }>;
    alerts: {
        lowStock: Array<{
            materialId: string;
            name: string;
            currentStock: number;
            threshold: number;
        }>;
        machinesNeedingAttention: Array<{
            machineId: string;
            name: string;
            efficiency: number;
            status: string;
        }>;
        pendingOrders: Array<{
            orderId: string;
            customerName: string;
            orderDate: string;
            daysPending: number;
        }>;
        upcomingDeliveries: Array<{
            orderId: string;
            customerName: string;
            deliveryDate: string;
            daysUntil: number;
        }>;
    };
}

export class DashboardService {
    async getStats(factoryId?: string): Promise<DashboardStats> {
        const today = new Date().toISOString().split('T')[0];

        // 1. Today's Production: Sum of actual_quantity from production_logs for today
        let productionQuery = supabase
            .from('production_logs')
            .select('actual_quantity')
            .eq('date', today);

        if (factoryId) {
            productionQuery = productionQuery.eq('factory_id', factoryId);
        }

        const { data: productionData, error: productionError } = await productionQuery;

        if (productionError) throw new Error(`Production stats error: ${productionError.message}`);

        const todaysProduction = productionData.reduce((sum, log) => sum + (log.actual_quantity || 0), 0);

        // 2. Active Machines: Count of machines where status = 'active'
        let machinesQuery = supabase
            .from('machines')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        if (factoryId) {
            machinesQuery = machinesQuery.eq('factory_id', factoryId);
        }

        const { count: activeMachines, error: machinesError } = await machinesQuery;

        if (machinesError) throw new Error(`Machine stats error: ${machinesError.message}`);

        // 3. Pending Orders: Count of sales_orders where status is 'reserved' (which means pending delivery)
        // We use 'reserved' as the pending state based on sales-order.service.ts logic
        const { count: pendingOrders, error: ordersError } = await supabase
            .from('sales_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'reserved');

        if (ordersError) throw new Error(`Order stats error: ${ordersError.message}`);

        // 4. Low Stock Alerts: Count of raw_materials where stock_weight_kg < 100kg (Default Threshold)
        let materialsQuery = supabase
            .from('raw_materials')
            .select('stock_weight_kg');

        if (factoryId) {
            materialsQuery = materialsQuery.eq('factory_id', factoryId);
        }

        const { data: materials, error: materialsError } = await materialsQuery;

        if (materialsError) throw new Error(`Inventory stats error: ${materialsError.message}`);

        const LOW_STOCK_THRESHOLD = 100; // kg
        const lowStockAlerts = materials.filter((m: any) => {
            return m.stock_weight_kg < LOW_STOCK_THRESHOLD;
        }).length;

        return {
            todaysProduction,
            activeMachines: activeMachines || 0,
            pendingOrders: pendingOrders || 0,
            lowStockAlerts
        };
    }

    async getComprehensiveData(startDate?: string, endDate?: string): Promise<ComprehensiveDashboardData> {
        const today = new Date().toISOString().split('T')[0];
        const start = startDate || this.getStartOfWeek();
        const end = endDate || today;

        // Production Metrics
        const productionMetrics = await this.getProductionMetrics(today, start, end);

        // Inventory Metrics
        const inventoryMetrics = await this.getInventoryMetrics();

        // Sales Metrics
        const salesMetrics = await this.getSalesMetrics(today, start, end);

        // Chart Data
        const productionTrends = await this.getProductionTrends(start, end);
        const machinePerformance = await this.getMachinePerformance(today);
        const salesTrends = await this.getSalesTrends(start, end);

        // Activity Feed
        const recentActivity = await this.getRecentActivity();

        // Alerts
        const alerts = await this.getAlerts(today);

        return {
            production: productionMetrics,
            inventory: inventoryMetrics,
            sales: salesMetrics,
            productionTrends,
            machinePerformance,
            salesTrends,
            recentActivity,
            alerts
        };
    }

    private async getProductionMetrics(today: string, startWeek: string, endWeek: string) {
        // Today's production
        const { data: todayData } = await supabase
            .from('production_logs')
            .select('actual_quantity, efficiency_percentage, is_cost_recovered, machine_id')
            .eq('date', today);

        const todayProduction = todayData?.reduce((sum, log) => sum + (log.actual_quantity || 0), 0) || 0;

        // This week's production
        const { data: weekData } = await supabase
            .from('production_logs')
            .select('actual_quantity')
            .gte('date', startWeek)
            .lte('date', endWeek);

        const thisWeekProduction = weekData?.reduce((sum, log) => sum + (log.actual_quantity || 0), 0) || 0;

        // Average efficiency
        const efficiencies = todayData?.map(log => log.efficiency_percentage || 0) || [];
        const averageEfficiency = efficiencies.length > 0
            ? efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length
            : 0;

        // Cost recovered machines
        const costRecoveredMachines = todayData?.filter(log => log.is_cost_recovered === true).length || 0;

        // Machine counts
        const { count: totalMachines } = await supabase
            .from('machines')
            .select('*', { count: 'exact', head: true });

        const { count: activeMachines } = await supabase
            .from('machines')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        return {
            today: todayProduction,
            thisWeek: thisWeekProduction,
            averageEfficiency: Math.round(averageEfficiency * 100) / 100,
            costRecoveredMachines,
            activeMachines: activeMachines || 0,
            totalMachines: totalMachines || 0
        };
    }

    private async getInventoryMetrics() {
        // Stock by state
        const { data: stockData } = await supabase
            .from('stock_balances')
            .select('state, quantity, products(selling_price)');

        const byState = {
            semi_finished: 0,
            packed: 0,
            finished: 0,
            reserved: 0,
            delivered: 0
        };

        let totalStockValue = 0;
        let finishedGoods = 0;

        stockData?.forEach((item: any) => {
            const state = item.state as keyof typeof byState;
            const qty = Number(item.quantity) || 0;
            if (byState.hasOwnProperty(state)) {
                byState[state] += qty;
            }
            if (state === 'finished') {
                finishedGoods += qty;
                const price = item.products?.selling_price || 0;
                totalStockValue += qty * price;
            }
        });

        // Raw materials
        const { data: rawMaterials } = await supabase
            .from('raw_materials')
            .select('stock_weight_kg, min_threshold_kg');

        const rawMaterialStock = rawMaterials?.reduce((sum, m) => sum + (m.stock_weight_kg || 0), 0) || 0;
        const lowStockAlerts = rawMaterials?.filter(m =>
            (m.stock_weight_kg || 0) < (m.min_threshold_kg || 100)
        ).length || 0;

        return {
            totalStockValue,
            finishedGoods,
            lowStockAlerts,
            rawMaterialStock,
            byState
        };
    }

    private async getSalesMetrics(today: string, startWeek: string, endWeek: string) {
        // Pending orders
        const { count: pendingOrders } = await supabase
            .from('sales_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'reserved');

        // Today's deliveries
        const { count: todayDeliveries } = await supabase
            .from('sales_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'delivered')
            .eq('order_date', today);

        // This week's revenue
        const { data: weekOrders } = await supabase
            .from('sales_orders')
            .select('total_amount')
            .eq('status', 'delivered')
            .gte('order_date', startWeek)
            .lte('order_date', endWeek);

        const thisWeekRevenue = weekOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;

        // Active customers (customers with orders in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: recentOrders } = await supabase
            .from('sales_orders')
            .select('customer_id')
            .gte('order_date', thirtyDaysAgo.toISOString().split('T')[0]);

        const activeCustomers = new Set(recentOrders?.map(o => o.customer_id) || []).size;

        return {
            pendingOrders: pendingOrders || 0,
            todayDeliveries: todayDeliveries || 0,
            thisWeekRevenue,
            activeCustomers
        };
    }

    private async getProductionTrends(startDate: string, endDate: string) {
        const { data } = await supabase
            .from('production_logs')
            .select('date, actual_quantity, theoretical_quantity, efficiency_percentage')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        // Group by date
        const trendsMap = new Map<string, { actual: number; theoretical: number; efficiency: number; count: number }>();

        data?.forEach((log) => {
            const date = log.date;
            const existing = trendsMap.get(date) || { actual: 0, theoretical: 0, efficiency: 0, count: 0 };
            existing.actual += log.actual_quantity || 0;
            existing.theoretical += log.theoretical_quantity || 0;
            existing.efficiency += log.efficiency_percentage || 0;
            existing.count += 1;
            trendsMap.set(date, existing);
        });

        return Array.from(trendsMap.entries()).map(([date, data]) => ({
            date,
            actual: data.actual,
            theoretical: data.theoretical,
            efficiency: data.count > 0 ? Math.round((data.efficiency / data.count) * 100) / 100 : 0
        }));
    }

    private async getMachinePerformance(today: string) {
        const { data: logs } = await supabase
            .from('production_logs')
            .select('machine_id, efficiency_percentage, machines(name, status)')
            .eq('date', today);

        // Group by machine
        const machineMap = new Map<string, { efficiency: number; count: number; name: string; status: string }>();

        if (logs) {
            logs.forEach((log: any) => {
                const machineId = log.machine_id;
                const existing = machineMap.get(machineId) || {
                    efficiency: 0,
                    count: 0,
                    name: log.machines?.name || 'Unknown',
                    status: log.machines?.status || 'unknown'
                };
                existing.efficiency += log.efficiency_percentage || 0;
                existing.count += 1;
                machineMap.set(machineId, existing);
            });
        }

        // If no logs for today, get all active machines
        if (machineMap.size === 0) {
            const { data: machines } = await supabase
                .from('machines')
                .select('id, name, status')
                .eq('status', 'active');

            if (machines) {
                machines.forEach((machine: any) => {
                    machineMap.set(machine.id, {
                        efficiency: 0,
                        count: 0,
                        name: machine.name,
                        status: machine.status
                    });
                });
            }
        }

        return Array.from(machineMap.entries()).map(([machineId, data]) => ({
            machineId,
            name: data.name,
            efficiency: data.count > 0 ? Math.round((data.efficiency / data.count) * 100) / 100 : 0,
            status: data.status
        }));
    }

    private async getSalesTrends(startDate: string, endDate: string) {
        const { data: orders } = await supabase
            .from('sales_orders')
            .select('order_date, total_amount, status')
            .gte('order_date', startDate)
            .lte('order_date', endDate)
            .order('order_date', { ascending: true });

        // Group by date
        const trendsMap = new Map<string, { orders: number; revenue: number }>();

        orders?.forEach((order) => {
            const date = order.order_date;
            const existing = trendsMap.get(date) || { orders: 0, revenue: 0 };
            existing.orders += 1;
            if (order.status === 'delivered') {
                existing.revenue += order.total_amount || 0;
            }
            trendsMap.set(date, existing);
        });

        return Array.from(trendsMap.entries()).map(([date, data]) => ({
            date,
            orders: data.orders,
            revenue: data.revenue
        }));
    }

    private async getRecentActivity() {
        // Get recent audit logs, production logs, and inventory transactions
        const [auditLogs, productionLogs, inventoryTransactions, salesOrders] = await Promise.all([
            supabase
                .from('audit_logs')
                .select('action, entity_type, created_at, user_id')
                .order('created_at', { ascending: false })
                .limit(10),
            supabase
                .from('production_logs')
                .select('created_at, actual_quantity, machine_id, product_id, machines(name), products(name)')
                .order('created_at', { ascending: false })
                .limit(5),
            supabase
                .from('inventory_transactions')
                .select('created_at, from_state, to_state, quantity')
                .order('created_at', { ascending: false })
                .limit(5),
            supabase
                .from('sales_orders')
                .select('created_at, status, customer_id, customers(name)')
                .order('created_at', { ascending: false })
                .limit(5)
        ]);

        const activities: Array<{ type: string; description: string; timestamp: string; user?: string }> = [];

        // Process audit logs
        if (auditLogs.data) {
            auditLogs.data.forEach((log: any) => {
                activities.push({
                    type: 'audit',
                    description: `${log.action} on ${log.entity_type}`,
                    timestamp: log.created_at,
                    user: undefined // User name would need separate query
                });
            });
        }

        // Process production logs
        if (productionLogs.data) {
            productionLogs.data.forEach((log: any) => {
                activities.push({
                    type: 'production',
                    description: `Produced ${log.actual_quantity} units on ${log.machines?.name || 'machine'}`,
                    timestamp: log.created_at
                });
            });
        }

        // Process inventory transactions
        if (inventoryTransactions.data) {
            inventoryTransactions.data.forEach((trans: any) => {
                activities.push({
                    type: 'inventory',
                    description: `Moved ${trans.quantity} from ${trans.from_state || 'new'} to ${trans.to_state || 'unknown'}`,
                    timestamp: trans.created_at
                });
            });
        }

        // Process sales orders
        if (salesOrders.data) {
            salesOrders.data.forEach((order: any) => {
                activities.push({
                    type: 'sales',
                    description: `Order ${order.status} for ${order.customers?.name || 'customer'}`,
                    timestamp: order.created_at
                });
            });
        }

        // Sort by timestamp and limit to 20 most recent
        return activities
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 20);
    }

    public async getAlerts(today: string) {
        // Low stock alerts
        const { data: rawMaterials } = await supabase
            .from('raw_materials')
            .select('id, name, stock_weight_kg, min_threshold_kg');

        const lowStock = (rawMaterials || [])
            .filter((m: any) => (m.stock_weight_kg || 0) < (m.min_threshold_kg || 100))
            .map((m: any) => ({
                materialId: m.id,
                name: m.name,
                currentStock: m.stock_weight_kg || 0,
                threshold: m.min_threshold_kg || 100
            }));

        // Machines needing attention (low efficiency or maintenance status)
        const { data: machines } = await supabase
            .from('machines')
            .select('id, name, status');

        const { data: todayLogs } = await supabase
            .from('production_logs')
            .select('machine_id, efficiency_percentage, machines(name, status)')
            .eq('date', today);

        const machineEfficiencyMap = new Map<string, { efficiency: number; count: number }>();
        todayLogs?.forEach((log: any) => {
            const machineId = log.machine_id;
            const existing = machineEfficiencyMap.get(machineId) || { efficiency: 0, count: 0 };
            existing.efficiency += log.efficiency_percentage || 0;
            existing.count += 1;
            machineEfficiencyMap.set(machineId, existing);
        });

        const machinesNeedingAttention = (machines || [])
            .filter((m: any) => {
                const status = m.status;
                const avgEff = machineEfficiencyMap.get(m.id);
                const efficiency = avgEff && avgEff.count > 0
                    ? avgEff.efficiency / avgEff.count
                    : 0;
                return status === 'maintenance' || (efficiency > 0 && efficiency < 70);
            })
            .map((m: any) => {
                const avgEff = machineEfficiencyMap.get(m.id);
                const efficiency = avgEff && avgEff.count > 0
                    ? Math.round((avgEff.efficiency / avgEff.count) * 100) / 100
                    : 0;
                return {
                    machineId: m.id,
                    name: m.name,
                    efficiency,
                    status: m.status
                };
            });

        // Pending orders (reserved status)
        const { data: pendingOrders } = await supabase
            .from('sales_orders')
            .select('id, order_date, status, customers(name)')
            .eq('status', 'reserved')
            .order('order_date', { ascending: true })
            .limit(10);

        const todayDate = new Date(today);
        const pendingOrdersList = (pendingOrders || []).map((order: any) => {
            const orderDate = new Date(order.order_date);
            const daysPending = Math.floor((todayDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
            return {
                orderId: order.id,
                customerName: order.customers?.name || 'Unknown',
                orderDate: order.order_date,
                daysPending
            };
        });

        // Upcoming deliveries (next 7 days)
        const nextWeek = new Date(todayDate);
        nextWeek.setDate(todayDate.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        const { data: upcomingDeliveries } = await supabase
            .from('sales_orders')
            .select('id, order_date, status, customers(name)')
            .eq('status', 'reserved')
            .gte('order_date', today)
            .lte('order_date', nextWeekStr)
            .order('order_date', { ascending: true })
            .limit(10);

        const upcomingDeliveriesList = (upcomingDeliveries || []).map((order: any) => {
            const deliveryDate = new Date(order.order_date);
            const daysUntil = Math.floor((deliveryDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
            return {
                orderId: order.id,
                customerName: order.customers?.name || 'Unknown',
                deliveryDate: order.order_date,
                daysUntil
            };
        });

        return {
            lowStock,
            machinesNeedingAttention,
            pendingOrders: pendingOrdersList,
            upcomingDeliveries: upcomingDeliveriesList
        };
    }

    private getStartOfWeek(): string {
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
        const monday = new Date(today.setDate(diff));
        return monday.toISOString().split('T')[0];
    }
}

export const dashboardService = new DashboardService();
