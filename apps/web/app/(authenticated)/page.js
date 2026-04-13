'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    TrendingUp,
    ShoppingCart,
    Package,
    AlertTriangle,
    RefreshCw,
    ArrowRight,
} from 'lucide-react';
import { dashboardAPI } from '@/lib/api';
import ProductionChart from '@/components/dashboard/ProductionChart';
import SalesChart from '@/components/dashboard/SalesChart';
import { formatCurrency, cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/contexts/SettingsContext';
import { useFactory } from '@/contexts/FactoryContext';
import { useUI } from '@/contexts/UIContext';
import styles from './page.module.css';

const TIME_PERIODS = [
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
];

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

export default function Home() {
    const { user } = useAuth();
    const { settings } = useSettings();
    const { selectedFactory } = useFactory();
    const { setPageTitle } = useUI();
    const router = useRouter();

    const [timePeriod, setTimePeriod] = useState('week');

    useEffect(() => {
        setPageTitle('Home');
    }, [setPageTitle]);

    const dateRange = useMemo(() => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        switch (timePeriod) {
            case 'today':
                return { startDate: todayStr, endDate: todayStr };
            case 'week': {
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - today.getDay() + 1);
                return { startDate: weekStart.toISOString().split('T')[0], endDate: todayStr };
            }
            case 'month': {
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                return { startDate: monthStart.toISOString().split('T')[0], endDate: todayStr };
            }
            default:
                return { startDate: null, endDate: null };
        }
    }, [timePeriod]);

    const { data: dashboardData, isLoading, refetch } = useQuery({
        queryKey: ['dashboard', dateRange, selectedFactory],
        queryFn: () => {
            const params = dateRange.startDate
                ? { startDate: dateRange.startDate, endDate: dateRange.endDate }
                : {};
            if (selectedFactory) params.factory_id = selectedFactory;
            return dashboardAPI.getComprehensive(params);
        },
    });

    const {
        production = { today: 0 },
        inventory = { lowStockAlerts: 0, stockValue: 0 },
        sales = { thisWeekRevenue: 0, pendingOrders: 0 },
        productionTrends = [],
        salesTrends = [],
    } = dashboardData || {};

    const firstName = user?.name?.split(' ')[0] || 'there';
    const periodLabel = TIME_PERIODS.find(p => p.value === timePeriod)?.label ?? 'This Week';

    const kpis = [
        {
            id: 'revenue',
            label: 'Revenue',
            sublabel: periodLabel,
            value: formatCurrency(sales.thisWeekRevenue),
            icon: ShoppingCart,
            color: 'indigo',
            href: '/orders',
        },
        {
            id: 'production',
            label: 'Tubs Produced',
            sublabel: 'Today',
            value: production.today,
            icon: TrendingUp,
            color: 'green',
            href: '/reports',
        },
        {
            id: 'pending',
            label: 'Pending Orders',
            sublabel: 'Awaiting dispatch',
            value: sales.pendingOrders,
            icon: Package,
            color: 'orange',
            href: '/orders',
        },
        {
            id: 'alerts',
            label: 'Low Stock Alerts',
            sublabel: 'Needs attention',
            value: inventory.lowStockAlerts,
            icon: AlertTriangle,
            color: inventory.lowStockAlerts > 0 ? 'red' : 'green',
            href: '/inventory',
        },
    ];

    if (isLoading) {
        return (
            <div className={styles.loadingScreen}>
                <RefreshCw size={24} className={styles.spinIcon} />
                <span>Loading dashboard…</span>
            </div>
        );
    }

    return (
        <div className={cn(styles.page, settings.compactMode && styles.compact)}>

            {/* ── HEADER ─────────────────────────────────────────── */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <p className={styles.greeting}>{getGreeting()},</p>
                    <h1 className={styles.name}>{firstName}</h1>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.periodGroup}>
                        {TIME_PERIODS.map(p => (
                            <button
                                key={p.value}
                                className={cn(styles.periodBtn, timePeriod === p.value && styles.periodBtnActive)}
                                onClick={() => setTimePeriod(p.value)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <button className={styles.refreshBtn} onClick={() => refetch()} title="Refresh">
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>

            {/* ── KPI CARDS ──────────────────────────────────────── */}
            <div className={styles.kpiGrid}>
                {kpis.map(kpi => {
                    const Icon = kpi.icon;
                    return (
                        <button
                            key={kpi.id}
                            className={cn(styles.kpiCard, styles[`kpi_${kpi.color}`])}
                            onClick={() => router.push(kpi.href)}
                        >
                            <div className={styles.kpiTop}>
                                <div className={cn(styles.kpiIconBox, styles[`icon_${kpi.color}`])}>
                                    <Icon size={16} />
                                </div>
                                <ArrowRight size={14} className={styles.kpiArrow} />
                            </div>
                            <div className={styles.kpiValue}>{kpi.value}</div>
                            <div className={styles.kpiMeta}>
                                <span className={styles.kpiLabel}>{kpi.label}</span>
                                <span className={styles.kpiSublabel}>{kpi.sublabel}</span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── CHARTS ──────────────────────────────────────────── */}
            <div className={styles.chartGrid}>
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <div>
                            <p className={styles.chartLabel}>PRODUCTION</p>
                            <h3 className={styles.chartTitle}>Output Trend</h3>
                        </div>
                        <div className={styles.chartIcon} style={{ background: 'var(--indigo-100)', color: 'var(--indigo-600)' }}>
                            <TrendingUp size={16} />
                        </div>
                    </div>
                    <div className={styles.chartBody}>
                        <ProductionChart data={productionTrends} timePeriod={timePeriod} compact={settings.compactMode} height={400} />
                    </div>
                </div>

                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <div>
                            <p className={styles.chartLabel}>SALES</p>
                            <h3 className={styles.chartTitle}>Revenue Trend</h3>
                        </div>
                        <div className={styles.chartIcon} style={{ background: 'var(--orange-100)', color: 'var(--orange-600)' }}>
                            <ShoppingCart size={16} />
                        </div>
                    </div>
                    <div className={styles.chartBody}>
                        <SalesChart data={salesTrends} compact={settings.compactMode} height={400} />
                    </div>
                </div>
            </div>
        </div>
    );
}
