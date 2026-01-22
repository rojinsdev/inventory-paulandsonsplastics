'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MetricCard from '@/components/dashboard/MetricCard';
import ProductionChart from '@/components/dashboard/ProductionChart';
import MachinePerformance from '@/components/dashboard/MachinePerformance';
import SalesChart from '@/components/dashboard/SalesChart';
import InventoryFlow from '@/components/dashboard/InventoryFlow';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import AlertsPanel from '@/components/dashboard/AlertsPanel';
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
import { dashboardAPI } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/contexts/SettingsContext';
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
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [timePeriod, setTimePeriod] = useState('week');
    const [dashboardData, setDashboardData] = useState(null);
    const [showCustomDateRange, setShowCustomDateRange] = useState(false);
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    useEffect(() => {
        setPageTitle('Dashboard');
        loadDashboardData();
    }, [timePeriod, setPageTitle]);

    useEffect(() => {
        registerGuide({
            title: 'Factory Dashboard',
            description: 'Real-time overview of production, inventory, and sales performance.',
            logic: [
                {
                    title: 'Active Machines',
                    explanation: 'Shows current running machines out of total available machines. Status is updated via production logs.'
                },
                {
                    title: 'Production Today',
                    explanation: 'Cumulative count of bundles produced across all machines since 00:00 local time.'
                },
                {
                    title: 'Inventory Flow',
                    explanation: 'Visualizes the transition of materials from Raw -> Semi-Finished -> Packed -> Finished -> Reserved.'
                }
            ],
            components: [
                { name: 'Stats Cards', description: 'Quick KPIs for today\'s performance.' },
                { name: 'Production Trends', description: 'Comparison between actual output and theoretical capacity.' },
                { name: 'Quick Actions', description: 'One-click shortcuts to common tasks like New Order or Production Logging.' }
            ]
        });
    }, [registerGuide]);



    const getDateRange = () => {
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
    };

    const handleCustomDateApply = () => {
        if (customStartDate && customEndDate) {
            if (new Date(customStartDate) > new Date(customEndDate)) {
                alert('Start date must be before end date');
                return;
            }
            loadDashboardData();
            setShowCustomDateRange(false);
        }
    };

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            setError(null);
            const { startDate, endDate } = getDateRange();
            const params = startDate ? { startDate, endDate } : {};
            const data = await dashboardAPI.getComprehensive(params);
            setDashboardData(data);
        } catch (err) {
            console.error('Dashboard data load error:', err);
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const MetricSection = ({ title, section, count, children }) => {
        const isExpanded = expandedSections[section];
        const ChevronIcon = isExpanded ? X : Plus;

        return (
            <div className={styles.metricSection}>
                <button
                    className={styles.sectionHeader}
                    onClick={() => toggleSection(section)}
                >
                    <div className={styles.sectionHeaderContent}>
                        <h3 className={styles.sectionTitle}>{title}</h3>
                        <span className={styles.sectionCount}>{count} metrics</span>
                    </div>
                    <ChevronIcon size={20} className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`} />
                </button>
                <div className={`${styles.sectionContent} ${isExpanded ? styles.expanded : ''}`}>
                    <div className={styles.sectionGrid}>
                        {children}
                    </div>
                </div>
            </div>
        );
    };

    const quickActions = [
        { label: 'New Order', icon: ShoppingCart, onClick: () => router.push('/orders') },
        { label: 'Production Log', icon: Factory, onClick: () => router.push('/production/logs') },
        { label: 'Pack Items', icon: Package, onClick: () => router.push('/inventory/packed') },
        { label: 'View Reports', icon: FileText, onClick: () => router.push('/reports') },
    ];

    if (loading) {
        return (
            <div className={styles.loading}>
                <RefreshCw className={styles.spinner} size={32} />
                <span>Loading factory overview...</span>
            </div>
        );
    }

    if (error || !dashboardData) {
        return (
            <div className={styles.error}>
                <p>{error || 'Failed to load dashboard data'}</p>
                <button className="btn btn-secondary" onClick={loadDashboardData}>
                    Retry
                </button>
            </div>
        );
    }

    const { production, inventory, sales, productionTrends, machinePerformance, salesTrends, recentActivity, alerts } = dashboardData;

    return (
        <>
            {/* Welcome Header */}
            <div className={styles.welcomeSection}>
                <div>
                    <h1 className={styles.welcomeTitle}>Hello, {user?.name || 'Admin'}!</h1>
                    <p className={styles.welcomeSubtitle}>Here's your factory overview</p>
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
                    <button className={styles.refreshButton} onClick={loadDashboardData} title="Refresh">
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

            {/* Dashboard Metrics - Filtered by User Settings */}
            {(() => {
                const allMetrics = [
                    { id: 'todayProduction', component: <MetricCard key="todayProduction" title="Today's Production" value={production.today} subtitle="Bundles produced" icon={Factory} gradient="linear-gradient(135deg, #3b82f6, #2563eb)" /> },
                    { id: 'activeMachines', component: <MetricCard key="activeMachines" title="Active Machines" value={`${production.activeMachines}/${production.totalMachines}`} subtitle="Currently running" icon={Activity} gradient="linear-gradient(135deg, #10b981, #059669)" /> },
                    { id: 'avgEfficiency', component: <MetricCard key="avgEfficiency" title="Avg Efficiency" value={`${production.averageEfficiency}%`} subtitle="Today's average" icon={TrendingUp} gradient="linear-gradient(135deg, #6366f1, #4f46e5)" /> },
                    { id: 'costRecovered', component: <MetricCard key="costRecovered" title="Cost Recovered" value={production.costRecoveredMachines} subtitle="Machines today" icon={DollarSign} gradient="linear-gradient(135deg, #f59e0b, #d97706)" /> },
                    { id: 'finishedGoods', component: <MetricCard key="finishedGoods" title="Finished Goods" value={inventory.finishedGoods} subtitle="Ready to sell" icon={Package} gradient="linear-gradient(135deg, #10b981, #059669)" /> },
                    { id: 'rawMaterial', component: <MetricCard key="rawMaterial" title="Raw Material" value={`${inventory.rawMaterialStock} kg`} subtitle="Total stock" icon={Boxes} gradient="linear-gradient(135deg, #6b7280, #4b5563)" /> },
                    { id: 'lowStockAlerts', component: <MetricCard key="lowStockAlerts" title="Low Stock Alerts" value={inventory.lowStockAlerts} subtitle="Needs attention" icon={AlertTriangle} gradient="linear-gradient(135deg, #ef4444, #dc2626)" /> },
                    { id: 'stockValue', component: <MetricCard key="stockValue" title="Stock Value" value={formatCurrency(inventory.totalStockValue)} subtitle="Finished goods value" icon={DollarSign} gradient="linear-gradient(135deg, #6366f1, #4f46e5)" /> },
                    { id: 'pendingOrders', component: <MetricCard key="pendingOrders" title="Pending Orders" value={sales.pendingOrders} subtitle="Awaiting delivery" icon={ShoppingCart} gradient="linear-gradient(135deg, #f59e0b, #d97706)" /> },
                    { id: 'todayDeliveries', component: <MetricCard key="todayDeliveries" title="Today's Deliveries" value={sales.todayDeliveries} subtitle="Completed today" icon={Truck} gradient="linear-gradient(135deg, #10b981, #059669)" /> },
                    { id: 'weekRevenue', component: <MetricCard key="weekRevenue" title="This Week Revenue" value={formatCurrency(sales.thisWeekRevenue)} subtitle="Total revenue" icon={DollarSign} gradient="linear-gradient(135deg, #3b82f6, #2563eb)" /> },
                    { id: 'activeCustomers', component: <MetricCard key="activeCustomers" title="Active Customers" value={sales.activeCustomers} subtitle="Last 30 days" icon={Users} gradient="linear-gradient(135deg, #6366f1, #4f46e5)" /> },
                ];

                const visibleMetrics = allMetrics.filter(m => settings.visibleMetrics?.[m.id]);

                if (visibleMetrics.length === 0) {
                    return (
                        <div className={styles.emptyMetrics}>
                            <p>No metrics selected. Open Settings to customize your dashboard.</p>
                        </div>
                    );
                }

                return (
                    <div className={styles.metricsGrid}>
                        {visibleMetrics.map(m => m.component)}
                    </div>
                );
            })()}

            {/* Inventory Flow - Linear Process Bar */}
            <div className={styles.flowSection}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Workflow & Status</h3>
                    <p className={styles.sectionSubtitle}>End-to-end production & stock process</p>
                </div>
                <InventoryFlow data={inventory.byState} rawMaterialStock={inventory.rawMaterialStock} />
            </div>

            {/* Charts Section */}
            <div className={styles.chartsGrid}>
                {/* Production Trends - Main Graph */}
                <div className={`${styles.chartCard} ${styles.fullWidth}`}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Production Trends</h3>
                        <span className={styles.chartSubtitle}>Daily production output vs capacity</span>
                    </div>
                    <ProductionChart data={productionTrends} timePeriod={timePeriod} />
                </div>

                {/* Machine Performance */}
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Machine Efficiency</h3>
                        <span className={styles.chartSubtitle}>Today's performance by unit</span>
                    </div>
                    <MachinePerformance data={machinePerformance} />
                </div>

                {/* Sales Trends */}
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Sales & Revenue</h3>
                        <span className={styles.chartSubtitle}>Revenue and order volume trends</span>
                    </div>
                    <SalesChart data={salesTrends} />
                </div>
            </div>


        </>
    );
}
