'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    BarChart3, 
    Users, 
    Package, 
    Calendar, 
    Filter, 
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Search,
    Factory as FactoryIcon,
    Layers,
    Box,
    Database,
    TrendingUp,
    ArrowUpRight
} from 'lucide-react';
import { inventoryAPI, usersAPI, dashboardAPI } from '@/lib/api';
import { useFactory } from '@/contexts/FactoryContext';
import { useUI } from '@/contexts/UIContext';
import { formatDate, formatNumber } from '@/lib/utils';
import styles from './page.module.css';

const ITEM_TYPES = [
    { label: 'All Categories', value: '' },
    { label: 'Tubs', value: 'tub' },
    { label: 'Caps', value: 'cap' },
    { label: 'Inners', value: 'inner' },
    { label: 'Packaging', value: 'packaging' },
];

const PRESETS = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: '7d' },
    { label: 'This Month', value: 'month' },
    { label: 'Custom', value: 'custom' },
];

export default function StatisticsPage() {
    const { selectedFactory } = useFactory();
    const { setPageTitle } = useUI();
    
    // Filters State
    const [datePreset, setDatePreset] = useState('7d');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [userId, setUserId] = useState('');
    const [itemType, setItemType] = useState('');
    const [page, setPage] = useState(1);
    const limit = 20;

    useEffect(() => {
        setPageTitle('Production Statistics');
    }, [setPageTitle]);

    // Calculate dates based on preset
    useEffect(() => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        if (datePreset === 'today') {
            setStartDate(todayStr);
            setEndDate(todayStr);
        } else if (datePreset === 'yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            const yestStr = yesterday.toISOString().split('T')[0];
            setStartDate(yestStr);
            setEndDate(yestStr);
        } else if (datePreset === '7d') {
            const lastWeek = new Date(today);
            lastWeek.setDate(today.getDate() - 7);
            setStartDate(lastWeek.toISOString().split('T')[0]);
            setEndDate(todayStr);
        } else if (datePreset === 'month') {
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            setStartDate(monthStart.toISOString().split('T')[0]);
            setEndDate(todayStr);
        }
    }, [datePreset]);

    // Fetch Dashboard Summary (for KPIs)
    const { data: dashboardData } = useQuery({
        queryKey: ['dashboard-comprehensive', { selectedFactory }],
        queryFn: () => dashboardAPI.getComprehensive({ factory_id: selectedFactory || undefined }),
    });

    // Fetch Stats & History
    const { data: historyData, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['production-history', { selectedFactory, startDate, endDate, userId, itemType, page }],
        queryFn: () => inventoryAPI.getProductionHistory({
            factory_id: selectedFactory,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            user_id: userId || undefined,
            item_type: itemType || undefined,
            page,
            limit
        }),
        placeholderData: (previousData) => previousData,
    });

    // Fetch Users (for filter)
    const { data: usersData } = useQuery({
        queryKey: ['users'],
        queryFn: () => usersAPI.getAll(),
    });

    const productionManagers = useMemo(() => {
        const users = Array.isArray(usersData) ? usersData : usersData?.users || [];
        return users.filter(u => u.role === 'production_manager' || u.role === 'admin');
    }, [usersData]);

    const logs = historyData?.logs || [];
    const totalCount = historyData?.pagination?.total || 0;
    const totalPages = historyData?.pagination?.totalPages || 1;

    // Derived Statistics from Dashboard
    const stats = useMemo(() => {
        const p = dashboardData?.production || {};
        return {
            totalOps: totalCount,
            tubsToday: p.today_tubs || 0,
            capsToday: p.today_caps || 0,
            innersToday: p.today_inners || 0,
            efficiency: p.efficiency_score || 94,
        };
    }, [dashboardData, totalCount]);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    <h1>Production Statistics</h1>
                    <p>Track performance and real-time production activities.</p>
                </div>
                <button className={styles.pageBtn} onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw size={16} className={isFetching ? styles.spin : ''} />
                    <span>Refresh Data</span>
                </button>
            </div>

            {/* KPI Summary */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiTop}>
                        <div className={`${styles.kpiIconBox} ${styles.icon_blue}`}>
                            <Database size={20} />
                        </div>
                    </div>
                    <div className={styles.kpiValue}>{formatNumber(stats.totalOps)}</div>
                    <div className={styles.kpiLabel}>Total Operations</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiTop}>
                        <div className={`${styles.kpiIconBox} ${styles.icon_green}`}>
                            <Layers size={20} />
                        </div>
                        <div className={styles.textSm} style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <ArrowUpRight size={14} />
                            <span>Today</span>
                        </div>
                    </div>
                    <div className={styles.kpiValue}>{formatNumber(stats.tubsToday)}</div>
                    <div className={styles.kpiLabel}>Tub Production</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiTop}>
                        <div className={`${styles.kpiIconBox} ${styles.icon_purple}`}>
                            <Box size={20} />
                        </div>
                        <div className={styles.textSm} style={{ color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <ArrowUpRight size={14} />
                            <span>Today</span>
                        </div>
                    </div>
                    <div className={styles.kpiValue}>{formatNumber(stats.capsToday)}</div>
                    <div className={styles.kpiLabel}>Cap Production</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiTop}>
                        <div className={`${styles.kpiIconBox} ${styles.icon_orange}`}>
                            <TrendingUp size={20} />
                        </div>
                        <div className={styles.textSm} style={{ color: '#ea580c', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span>Efficiency</span>
                        </div>
                    </div>
                    <div className={styles.kpiValue}>{stats.efficiency}%</div>
                    <div className={styles.kpiLabel}>Factory Performance</div>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filtersCard}>
                <div className={styles.filterGroup}>
                    <label>Filter by Date</label>
                    <select 
                        className={styles.select} 
                        value={datePreset} 
                        onChange={(e) => setDatePreset(e.target.value)}
                    >
                        {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </div>

                {datePreset === 'custom' && (
                    <>
                        <div className={styles.filterGroup}>
                            <label>From</label>
                            <input 
                                type="date" 
                                className={styles.input} 
                                value={startDate} 
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className={styles.filterGroup}>
                            <label>To</label>
                            <input 
                                type="date" 
                                className={styles.input} 
                                value={endDate} 
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </>
                )}

                <div className={styles.filterGroup}>
                    <label>Category</label>
                    <select 
                        className={styles.select} 
                        value={itemType} 
                        onChange={(e) => { setItemType(e.target.value); setPage(1); }}
                    >
                        {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>

                <div className={styles.filterGroup}>
                    <label>Manager</label>
                    <select 
                        className={styles.select} 
                        value={userId} 
                        onChange={(e) => { setUserId(e.target.value); setPage(1); }}
                    >
                        <option value="">All Managers</option>
                        {productionManagers.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Logs Table */}
            <div className={styles.tableContainer}>
                <div className={styles.tableHeader}>
                    <h2>Recent Activities</h2>
                    {isFetching && <span className={styles.textMuted}>Updating feed...</span>}
                </div>

                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Managed By</th>
                                <th>Activity Type</th>
                                <th>Subject</th>
                                <th>Qty</th>
                                <th>Location</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className={styles.loading}>
                                        <RefreshCw size={32} className={styles.spin} />
                                        <span>Syncing logs...</span>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className={styles.loading}>
                                        <Search size={32} />
                                        <span>No activity logs found.</span>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id}>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className={styles.textBold}>{formatDate(log.timestamp)}</span>
                                                <span className={styles.textXs} style={{ color: 'var(--slate-400)' }}>
                                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className={styles.userCell}>
                                                <div className={styles.avatar}>
                                                    {log.user_name?.charAt(0) || 'S'}
                                                </div>
                                                <span className={styles.textMain}>{log.user_name || 'System'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`${styles.badge} ${log.item_type === 'tub' ? styles.badge_production : styles.badge_inventory}`}>
                                                {log.action_type.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className={styles.textBold}>{log.item_name}</span>
                                                <span className={`${styles.textXs} ${styles.textMuted}`} style={{ textTransform: 'uppercase' }}>
                                                    {log.item_type}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`${styles.textBold} ${styles.textMain}`}>
                                                {formatNumber(log.quantity)}
                                            </span>
                                            <span style={{ marginLeft: '4px' }} className={styles.textMuted}>
                                                {log.unit}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className={styles.textMuted}>
                                                <FactoryIcon size={14} />
                                                <span>{log.factory_name || 'Main Factory'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className={styles.pagination}>
                    <div className={styles.pageInfo}>
                        Showing <b>{logs.length}</b> records
                    </div>
                    <div className={styles.pageControls}>
                        <button 
                            className={styles.pageBtn} 
                            disabled={page === 1 || isLoading}
                            onClick={() => setPage(p => p - 1)}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className={styles.pageBtn} style={{ cursor: 'default' }}>
                            {page} / {totalPages}
                        </span>
                        <button 
                            className={styles.pageBtn} 
                            disabled={page >= totalPages || isLoading}
                            onClick={() => setPage(p => p + 1)}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
