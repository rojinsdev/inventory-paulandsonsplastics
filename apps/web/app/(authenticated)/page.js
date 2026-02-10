'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    Factory,
    Package,
    ShoppingCart,
    Activity,
    TrendingUp,
    AlertTriangle,
    Boxes,
    Users,
    Truck,
    DollarSign,

    RefreshCw,
    Plus,
    FileText,
    X
} from 'lucide-react';
import { dashboardAPI, cashFlowAPI } from '@/lib/api';
import BentoMetric from '@/components/dashboard/BentoMetric';
import BusinessHealthCard from '@/components/dashboard/BusinessHealthCard';
import ProductionChart from '@/components/dashboard/ProductionChart';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/contexts/SettingsContext';
import { useFactory } from '@/contexts/FactoryContext';
import { useGuide } from '@/contexts/GuideContext';
import { useUI } from '@/contexts/UIContext';
import styles from './page.module.css';

const TIME_PERIODS = [
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'Custom', value: 'custom' }
];

export default function Dashboard() {
    const { user } = useAuth();
    const { settings } = useSettings();
    const { selectedFactory } = useFactory();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const queryClient = useQueryClient();
    const router = useRouter();

    const [timePeriod, setTimePeriod] = useState('week');
    const [showCustomDateRange, setShowCustomDateRange] = useState(false);
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [expandedSections, setExpandedSections] = useState({
        production: true,
        inventory: true,
        sales: true
    });

    const dateRange = useMemo(() => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        switch (timePeriod) {
            case 'today':
                return { startDate: todayStr, endDate: todayStr };
            case 'week': {
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
                return { startDate: weekStart.toISOString().split('T')[0], endDate: todayStr };
            }
            case 'month': {
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                return { startDate: monthStart.toISOString().split('T')[0], endDate: todayStr };
            }
            case 'custom':
                if (customStartDate && customEndDate) {
                    return { startDate: customStartDate, endDate: customEndDate };
                }
                return { startDate: null, endDate: null };
            default:
                return { startDate: null, endDate: null };
        }
    }, [timePeriod, customStartDate, customEndDate]);

    const { data: dashboardData, isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['dashboard', dateRange, selectedFactory],
        queryFn: () => {
            const params = dateRange.startDate ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : {};
            if (selectedFactory) {
                params.factory_id = selectedFactory;
            }
            return dashboardAPI.getComprehensive(params);
        },
        enabled: timePeriod !== 'custom' || (!!customStartDate && !!customEndDate),
    });

    const error = queryError?.message;


    useEffect(() => {
        setPageTitle('Dashboard');
    }, [setPageTitle]);

    useEffect(() => {
        registerGuide({
            title: 'Factory Dashboard',
            description: 'Real-time overview of production, inventory, and sales performance.',
            logic: [
                {
                    title: 'Bento Command Center',
                    explanation: 'An interactive grid showing production trends, financial health, and operational KPIs.'
                },
                {
                    title: 'Financial Pulse',
                    explanation: 'Real-time inflow and outflow tracking with survival balance calculation.'
                },
                {
                    title: 'Priority Alerts',
                    explanation: 'Critical stock levels and order delays highlighted for immediate action.'
                }
            ],
            components: [
                { name: 'Production Chart', description: 'Visual comparison of actual vs theoretical output.' },
                { name: 'Business Health', description: 'High-level financial insights.' },
                { name: 'Operational Metrics', description: 'Key performance indicators for efficiency and output.' }
            ]
        });
    }, [registerGuide]);



    const handleCustomDateApply = () => {
        if (customStartDate && customEndDate) {
            if (new Date(customStartDate) > new Date(customEndDate)) {
                alert('Start date must be before end date');
                return;
            }
            refetch();
            setShowCustomDateRange(false);
        }
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };



    const { data: financeData } = useQuery({
        queryKey: ['cash-flow-analytics', dateRange, selectedFactory],
        queryFn: () => {
            const params = dateRange.startDate ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : {};
            if (selectedFactory) params.factory_id = selectedFactory;
            return cashFlowAPI.getAnalytics(params);
        }
    });

    if (loading) {
        return (
            <div className={styles.loading}>
                <RefreshCw className={styles.spinner} size={32} />
                <span>Loading factory overview...</span>
            </div>
        );
    }

    if (error || (!loading && !dashboardData)) {
        return (
            <div className={styles.error}>
                <p>{error || 'Failed to load dashboard data'}</p>
                <button className="btn btn-secondary" onClick={() => refetch()}>
                    Retry
                </button>
            </div>
        );
    }

    const {
        production = { today: 0, averageEfficiency: 0 },
        inventory = { lowStockAlerts: 0 },
        sales = { thisWeekRevenue: 0, pendingOrders: 0 },
        productionTrends = [],
        machinePerformance = [],
        salesTrends = [],
        alerts: alertsData = {}
    } = dashboardData || {};

    return (
        <div className={cn(styles.dashboard, settings.compactMode && styles.compact)}>
            <div className={styles.welcomeSection}>
                <div>
                    <h1 className={styles.welcomeTitle}>Hello, {user?.name || 'Admin'}!</h1>
                    <p className={styles.welcomeSubtitle}>Here's your perfect operational overview</p>
                </div>
                <div className={styles.timeSelector}>

                    {TIME_PERIODS.map((period) => (
                        <button
                            key={period.value}
                            className={`${styles.timeButton} ${timePeriod === period.value ? styles.active : ''}`}
                            onClick={() => {
                                setTimePeriod(period.value);
                                if (period.value === 'custom') {
                                    setShowCustomDateRange(true);
                                } else {
                                    setShowCustomDateRange(false);
                                }
                            }}
                        >
                            {period.label}
                        </button>
                    ))}
                    <button className={styles.refreshButton} onClick={() => refetch()} title="Refresh">
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* Custom Date Range Picker */}
            {showCustomDateRange && (
                <div className={styles.customDateRange}>
                    <div className={styles.customDateContent}>
                        <label>
                            Start Date:
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </label>
                        <label>
                            End Date:
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </label>
                        <button
                            className={styles.applyButton}
                            onClick={handleCustomDateApply}
                            disabled={!customStartDate || !customEndDate}
                        >
                            Apply
                        </button>
                        <button
                            className={styles.cancelButton}
                            onClick={() => {
                                setShowCustomDateRange(false);
                                setTimePeriod('week');
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Bento Grid Command Center */}
            <div className={styles.bentoGrid}>
                {/* Production Achievement - 2x2 Hero */}
                {settings.visibleMetrics.productionAchievement && (
                    <div className={cn(styles.bentoCard, styles.span2x2)}>
                        <div className={styles.cardHeaderArea}>
                            <div className={styles.cardIcon}>
                                <TrendingUp size={20} />
                            </div>
                            <h3 className={styles.cardTitle}>Production Achievement</h3>
                            <span className={styles.cardSubtitle}>Actual output vs Theoretical capacity</span>
                        </div>
                        <div style={{ height: '300px', marginTop: '1.5rem' }}>
                            <ProductionChart data={productionTrends} timePeriod={timePeriod} compact={settings.compactMode} />
                        </div>
                    </div>
                )}

                {/* Financial Pulse - 2x1 */}
                {settings.visibleMetrics.businessHealthCard && (
                    <BusinessHealthCard data={financeData} spanClass="span2x1" />
                )}

                {/* Revenue Insight - 1x1 */}
                {settings.visibleMetrics.revenuePerformance && (
                    <BentoMetric
                        title="Revenue Performance"
                        value={formatCurrency(sales.thisWeekRevenue)}
                        subtitle="This period's total"
                        icon={DollarSign}
                        trend="+8.4%"
                        isTrendUp={true}
                        spanClass="span1x1"
                        onClick={() => router.push('/reports/sales')}
                    />
                )}

                {/* Efficiency Gauge - 1x1 */}
                {settings.visibleMetrics.overallEfficiency && (
                    <BentoMetric
                        title="Overall Efficiency"
                        value={`${production.averageEfficiency}%`}
                        subtitle="Factory performance score"
                        icon={Activity}
                        trend={production.averageEfficiency > 85 ? "+2.1%" : "-1.2%"}
                        isTrendUp={production.averageEfficiency > 85}
                        spanClass="span1x1"
                    />
                )}

                {/* Pending Focus - 1x1 */}
                {settings.visibleMetrics.ordersQueue && (
                    <BentoMetric
                        title="Orders in Queue"
                        value={sales.pendingOrders}
                        subtitle="Awaiting processing"
                        icon={ShoppingCart}
                        spanClass="span1x1"
                        className={sales.pendingOrders > 10 ? styles.highPriority : ''}
                        onClick={() => router.push('/orders?status=pending')}
                    />
                )}

                {/* Achievement Score - 1x1 */}
                {settings.visibleMetrics.outputToday && (
                    <BentoMetric
                        title="Output Today"
                        value={production.today}
                        subtitle="Bundles completed"
                        icon={Package}
                        trend="+120"
                        isTrendUp={true}
                        spanClass="span1x1"
                        onClick={() => router.push('/production')}
                    />
                )}

                {/* Active Machines - 1x1 */}
                {settings.visibleMetrics.activeMachines && (
                    <BentoMetric
                        title="Active Machines"
                        value={production.activeMachines || 0}
                        subtitle="Currently running"
                        icon={Activity}
                        spanClass="span1x1"
                        onClick={() => router.push('/machines')}
                    />
                )}

                {/* Cost Recovered - 1x1 */}
                {settings.visibleMetrics.costRecovered && (
                    <BentoMetric
                        title="Cost Recovered"
                        value={formatCurrency(production.costRecovered || 0)}
                        subtitle="Operational recovery"
                        icon={DollarSign}
                        spanClass="span1x1"
                    />
                )}

                {/* Finished Goods - 1x1 */}
                {settings.visibleMetrics.finishedGoods && (
                    <BentoMetric
                        title="Finished Goods"
                        value={inventory.finishedGoods || 0}
                        subtitle="Ready for dispatch"
                        icon={Package}
                        spanClass="span1x1"
                        onClick={() => router.push('/inventory/products')}
                    />
                )}

                {/* Raw Material - 1x1 */}
                {settings.visibleMetrics.rawMaterial && (
                    <BentoMetric
                        title="Raw Material"
                        value={`${inventory.rawMaterial || 0} kg`}
                        subtitle="Total stock on hand"
                        icon={Boxes}
                        spanClass="span1x1"
                        onClick={() => router.push('/inventory/raw-materials')}
                    />
                )}

                {/* Stock Value - 1x1 */}
                {settings.visibleMetrics.stockValue && (
                    <BentoMetric
                        title="Stock Value"
                        value={formatCurrency(inventory.stockValue || 0)}
                        subtitle="Estimated worth"
                        icon={DollarSign}
                        spanClass="span1x1"
                    />
                )}

                {/* Today's Deliveries - 1x1 */}
                {settings.visibleMetrics.todayDeliveries && (
                    <BentoMetric
                        title="Today's Deliveries"
                        value={sales.todayDeliveries || 0}
                        subtitle="Out for delivery"
                        icon={Truck}
                        spanClass="span1x1"
                        onClick={() => router.push('/deliveries')}
                    />
                )}

                {/* Active Customers - 1x1 */}
                {settings.visibleMetrics.activeCustomers && (
                    <BentoMetric
                        title="Active Customers"
                        value={sales.activeCustomers || 0}
                        subtitle="With recent activity"
                        icon={Users}
                        spanClass="span1x1"
                        onClick={() => router.push('/customers')}
                    />
                )}

                {/* Critical Stock alerts - 2x1 */}
                {settings.visibleMetrics.inventoryAlerts && (
                    <div className={cn(styles.bentoCard, styles.span2x1)}>
                        <div className={styles.cardHeaderArea}>
                            <div className={cn(styles.cardIcon, styles.alertIcon)}>
                                <AlertTriangle size={20} />
                            </div>
                            <h3 className={styles.cardTitle}>Inventory Alerts</h3>
                            <span className={styles.cardSubtitle}>{inventory.lowStockAlerts} items below minimum</span>
                        </div>
                        <div className={styles.alertList}>
                            {(alertsData.lowStock || []).slice(0, 3).map((alert, idx) => (
                                <div
                                    key={idx}
                                    className={styles.alertItem}
                                    onClick={() => router.push(`/inventory?search=${encodeURIComponent(alert.name)}`)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span className={styles.alertName}>{alert.name}</span>
                                    <span className={styles.alertValue}>{alert.currentStock}&nbsp;kg left</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
