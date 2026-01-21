'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout';
import { Loader2, Factory, TrendingUp, AlertTriangle, Download, Calendar, Filter, X, RefreshCw } from 'lucide-react';
import { productionAPI, machinesAPI, productsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatNumber, formatDate, cn } from '@/lib/utils';
import styles from './page.module.css';

const DATE_PRESETS = [
    { value: 'today', label: 'Today' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'custom', label: 'Custom Range' },
];

export default function ProductionReportsPage() {
    const { registerGuide } = useGuide();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [logs, setLogs] = useState([]);
    const [machines, setMachines] = useState([]);
    const [products, setProducts] = useState([]);
    const [datePreset, setDatePreset] = useState('this_month');
    const [filters, setFilters] = useState({
        date_from: '',
        date_to: '',
        machine_id: '',
        product_id: '',
    });

    useEffect(() => {
        registerGuide({
            title: "Production Reports",
            description: "Deep analytics on factory output, efficiency trends, and verification compliance.",
            logic: [
                {
                    title: "Efficiency Calculus (%)",
                    explanation: "Efficiency is (Actual Output / Theoretical Capacity). 'Theoretical Capacity' is the maximum bundles a machine can produce in 23 hours. Anything above 70% is considered a healthy production run."
                },
                {
                    title: "The Verification Cycle",
                    explanation: "Logs stay 'Pending' until a manager clicks 'Verify'. This is the final check before stock is officially added to your warehouse counts, preventing data entry mistakes."
                }
            ],
            components: [
                {
                    name: "Performance Scorecard",
                    description: "High-level KPIs showing total output vs. target efficiency for the selected period."
                },
                {
                    name: "Audit Trail Grid",
                    description: "Chronological log of manufacturing events with deep-linking to specific machine/product performance."
                }
            ]
        });
        loadMachinesAndProducts();
        applyDatePreset(datePreset);
    }, [registerGuide]);

    useEffect(() => {
        if (filters.date_from || filters.date_to) {
            loadData();
        }
    }, [filters]);

    const getDateRange = (preset) => {
        const today = new Date();
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_week':
                start.setDate(today.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_month':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'last_month':
                start.setMonth(today.getMonth() - 1, 1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(today.getMonth(), 0);
                end.setHours(23, 59, 59, 999);
                break;
            default:
                return { from: '', to: '' };
        }

        return {
            from: start.toISOString().split('T')[0],
            to: end.toISOString().split('T')[0],
        };
    };

    const applyDatePreset = (preset) => {
        if (preset === 'custom') {
            return;
        }
        const range = getDateRange(preset);
        setFilters(prev => ({
            ...prev,
            date_from: range.from,
            date_to: range.to,
        }));
    };

    const loadMachinesAndProducts = async () => {
        try {
            const [machinesData, productsData] = await Promise.all([
                machinesAPI.getAll().catch(() => []),
                productsAPI.getAll().catch(() => []),
            ]);
            setMachines(Array.isArray(machinesData) ? machinesData : []);
            setProducts(Array.isArray(productsData) ? productsData : []);
        } catch (err) {
            console.error('Failed to load machines/products:', err);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const params = {
                start_date: filters.date_from,
                end_date: filters.date_to,
                machine_id: filters.machine_id || undefined,
                product_id: filters.product_id || undefined,
            };
            const logsData = await productionAPI.getLogs(params).catch(() => []);
            setLogs(Array.isArray(logsData) ? logsData : []);
        } catch (err) {
            setError(err.message || 'Failed to load production logs');
        } finally {
            setLoading(false);
        }
    };

    const handleFilter = () => {
        loadData();
    };

    const handleClearFilters = () => {
        setFilters({
            date_from: '',
            date_to: '',
            machine_id: '',
            product_id: '',
        });
        setDatePreset('custom');
    };

    const handleExport = () => {
        const csvContent = [
            ['Date', 'Machine', 'Product', 'Actual Quantity', 'Theoretical Quantity', 'Efficiency %', 'Status'].join(','),
            ...logs.map(log => [
                formatDate(log.date || log.created_at),
                getMachineName(log.machine_id),
                getProductName(log.product_id),
                log.actual_quantity || 0,
                log.theoretical_quantity || 0,
                log.efficiency_percentage || log.efficiency || 0,
                log.verified ? 'Verified' : 'Pending'
            ].map(field => `"${field}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `production-report-${filters.date_from || 'all'}-${filters.date_to || 'all'}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const getMachineName = (id) => {
        const m = machines.find((m) => m.machine_id === id || m.id === id);
        return m?.machine_name || m?.name || 'Unknown';
    };

    const getProductName = (id) => {
        const p = products.find((p) => p.product_id === id || p.id === id);
        return p ? `${p.product_name || p.name} (${p.size || ''})` : 'Unknown';
    };

    // Stats
    const totalProduction = logs.reduce((sum, log) => sum + (log.actual_quantity || 0), 0);
    const avgEfficiency = logs.length > 0
        ? Math.round(logs.reduce((sum, log) => sum + (log.efficiency_percentage || log.efficiency || 0), 0) / logs.length)
        : 0;
    const lowEfficiencyCount = logs.filter((log) => (log.efficiency_percentage || log.efficiency || 0) < 70).length;
    const hasFilters = filters.machine_id || filters.product_id || filters.date_from || filters.date_to;

    return (
        <DashboardLayout title="Production Reports">
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Production Reports</h1>
                    <p className={styles.pageDescription}>
                        View production logs, efficiency metrics, and machine performance
                    </p>
                </div>
                {logs.length > 0 && (
                    <button className={styles.exportButton} onClick={handleExport}>
                        <Download size={18} />
                        <span>Export CSV</span>
                    </button>
                )}
            </div>

            {/* Filter Bar */}
            <div className={styles.filterBar}>
                <div className={styles.filterRow}>
                    <div className={styles.filterGroup}>
                        <Filter size={16} className={styles.filterIcon} />
                        <select
                            className={styles.filterSelect}
                            value={datePreset}
                            onChange={(e) => {
                                setDatePreset(e.target.value);
                                applyDatePreset(e.target.value);
                            }}
                        >
                            {DATE_PRESETS.map((preset) => (
                                <option key={preset.value} value={preset.value}>
                                    {preset.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {datePreset === 'custom' && (
                        <>
                            <div className={styles.filterGroup}>
                                <input
                                    type="date"
                                    className={styles.filterInput}
                                    value={filters.date_from}
                                    onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                                    placeholder="From Date"
                                />
                            </div>
                            <div className={styles.filterGroup}>
                                <input
                                    type="date"
                                    className={styles.filterInput}
                                    value={filters.date_to}
                                    onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                                    placeholder="To Date"
                                />
                            </div>
                        </>
                    )}

                    <div className={styles.filterGroup}>
                        <select
                            className={styles.filterSelect}
                            value={filters.machine_id}
                            onChange={(e) => setFilters({ ...filters, machine_id: e.target.value })}
                        >
                            <option value="">All Machines</option>
                            {machines.map((m) => (
                                <option key={m.machine_id || m.id} value={m.machine_id || m.id}>
                                    {m.machine_name || m.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <select
                            className={styles.filterSelect}
                            value={filters.product_id}
                            onChange={(e) => setFilters({ ...filters, product_id: e.target.value })}
                        >
                            <option value="">All Products</option>
                            {products.map((p) => (
                                <option key={p.product_id || p.id} value={p.product_id || p.id}>
                                    {p.product_name || p.name} ({p.size || ''})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.filterActions}>
                        <button className={styles.applyButton} onClick={handleFilter}>
                            Apply Filters
                        </button>
                        {hasFilters && (
                            <button className={styles.clearButton} onClick={handleClearFilters}>
                                <X size={16} />
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Factory size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatNumber(totalProduction)}</div>
                        <div className={styles.statLabel}>Total Production</div>
                        <div className={styles.statSublabel}>Items produced</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <TrendingUp size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{avgEfficiency}%</div>
                        <div className={styles.statLabel}>Average Efficiency</div>
                        <div className={styles.statSublabel}>Overall performance</div>
                    </div>
                </div>
                {lowEfficiencyCount > 0 && (
                    <div className={`${styles.statCard} ${styles.statCardWarning}`}>
                        <div className={styles.statIcon}>
                            <AlertTriangle size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{lowEfficiencyCount}</div>
                            <div className={styles.statLabel}>Low Efficiency</div>
                            <div className={styles.statSublabel}>Below 70% threshold</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spinner} />
                        <span>Loading production logs...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <AlertTriangle size={24} />
                        <p>{error}</p>
                        <button className={styles.retryButton} onClick={loadData}>
                            <RefreshCw size={16} />
                            Retry
                        </button>
                    </div>
                ) : logs.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Factory size={48} />
                        <p>No production logs found</p>
                        <p className={styles.emptyHint}>
                            {hasFilters ? 'Try adjusting your filters' : 'Production logs are created from the mobile app'}
                        </p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Machine</th>
                                    <th>Product</th>
                                    <th style={{ textAlign: 'right' }}>Actual</th>
                                    <th style={{ textAlign: 'right' }}>Theoretical</th>
                                    <th style={{ textAlign: 'right' }}>Efficiency</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => {
                                    const efficiency = log.efficiency_percentage || log.efficiency || 0;
                                    const isLow = efficiency < 70;
                                    return (
                                        <tr key={log.production_log_id || log.id}>
                                            <td className={styles.dateCell}>{formatDate(log.date || log.created_at)}</td>
                                            <td className={styles.machineCell}>{getMachineName(log.machine_id)}</td>
                                            <td>{getProductName(log.product_id)}</td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                                {formatNumber(log.actual_quantity)}
                                            </td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCellMuted}>
                                                {formatNumber(log.theoretical_quantity)}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className={cn(styles.efficiencyBadge, isLow && styles.efficiencyLow)}>
                                                    {efficiency.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td>
                                                {log.verified ? (
                                                    <span className="badge badge-success">Verified</span>
                                                ) : (
                                                    <span className="badge badge-warning">Pending</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
