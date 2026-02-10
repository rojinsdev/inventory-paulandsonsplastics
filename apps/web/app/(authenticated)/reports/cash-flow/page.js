'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    DollarSign,
    ArrowUpCircle,
    ArrowDownCircle,
    Calendar,
    Filter,
    Plus,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    PieChart as PieIcon,
    History,
    Factory as FactoryIcon,
    ChevronDown,
    MoreVertical,
    CheckCircle2,
    AlertCircle,
    X,
    FileText,
    Download,
    Settings
} from 'lucide-react';
import { cashFlowAPI, factoriesAPI } from '@/lib/api';
import CategoryManager from './CategoryManager';
import { formatCurrency, formatDate, cn, getLocalDateISO } from '@/lib/utils';
import { useUI } from '@/contexts/UIContext';
import { useFactory } from '@/contexts/FactoryContext';
import { useSettings } from '@/contexts/SettingsContext';
import MetricCard from '@/components/dashboard/MetricCard';
import {
    LineChart,
    BarChart,
    PieChart,
} from '@mui/x-charts';
import styles from './page.module.css';


export default function CashFlowPage() {
    const { setPageTitle } = useUI();
    const { selectedFactory } = useFactory();
    const { settings } = useSettings();
    const queryClient = useQueryClient();

    const [period, setPeriod] = useState('month'); // 'month' | 'day'
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [filterFactory, setFilterFactory] = useState(selectedFactory || 'all');
    const [selectedDate, setSelectedDate] = useState(getLocalDateISO());
    const [showEntryModal, setShowEntryModal] = useState(false);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [entryType, setEntryType] = useState('expense');

    useEffect(() => {
        setPageTitle('Cash Flow & Expenses');
    }, [setPageTitle]);

    // Update filter when factory changes globally
    useEffect(() => {
        if (selectedFactory) setFilterFactory(selectedFactory);
    }, [selectedFactory]);

    const { data: analytics, isLoading: loadingAnalytics, refetch: refetchAnalytics } = useQuery({
        queryKey: ['cash-flow-analytics', period, month, year, selectedDate, filterFactory],
        queryFn: () => cashFlowAPI.getAnalytics({
            month: period === 'month' ? month : undefined,
            year: period === 'month' ? year : undefined,
            date: period === 'day' ? selectedDate : undefined,
            factory_id: filterFactory === 'all' ? undefined : filterFactory
        })
    });

    const { data: dailySheet, isLoading: loadingDaily, refetch: refetchDaily } = useQuery({
        queryKey: ['cash-flow-daily', selectedDate, filterFactory],
        queryFn: () => cashFlowAPI.getDailySheet({
            date: selectedDate,
            factory_id: filterFactory === 'all' ? undefined : filterFactory
        })
    });

    const { data: factories } = useQuery({
        queryKey: ['factories'],
        queryFn: () => factoriesAPI.getAll()
    });

    const { data: categories } = useQuery({
        queryKey: ['cash-flow-categories'],
        queryFn: () => cashFlowAPI.getCategories()
    });

    const survivalStatus = useMemo(() => {
        if (!analytics) return { label: 'Checking...', color: 'var(--text-muted)' };
        const net = analytics.netCashFlow;
        if (net > 500000) return { label: 'Healthy', color: 'var(--success)', icon: CheckCircle2 };
        if (net > 0) return { label: 'Stable', color: 'var(--primary)', icon: CheckCircle2 };
        if (net > -100000) return { label: 'Caution', color: 'var(--warning)', icon: AlertCircle };
        return { label: 'Critical', color: 'var(--error)', icon: AlertCircle };
    }, [analytics]);

    const handleRefresh = () => {
        refetchAnalytics();
        refetchDaily();
    };

    const chartData = useMemo(() => {
        if (!analytics) return { xAxis: [], series: [] };

        if (period === 'day' && analytics.transactions) {
            // Initialize 24 hours
            const hourly = Array(24).fill(0).map((_, i) => ({
                hour: i,
                label: `${i === 0 ? '12' : i > 12 ? i - 12 : i} ${i < 12 ? 'AM' : 'PM'}`,
                income: 0,
                expense: 0
            }));

            analytics.transactions.forEach(t => {
                // Use created_at for time distribution
                const date = new Date(t.created_at);
                const hour = date.getHours();
                const amount = Number(t.amount);
                const type = t.cash_flow_categories?.type;

                if (type === 'income') hourly[hour].income += amount;
                else hourly[hour].expense += amount;
            });

            return {
                xAxis: [{
                    data: hourly.map(h => h.hour),
                    valueFormatter: (v) => hourly[v]?.label,
                    label: 'Hour of Day'
                }],
                series: [
                    { data: hourly.map(h => h.income), label: 'Inflow', color: '#10b981', area: true, showMark: false },
                    { data: hourly.map(h => h.expense), label: 'Outflow', color: '#ef4444', showMark: false }
                ]
            };
        }

        // Default Monthly View
        return {
            xAxis: [{ data: analytics.dailyTrends?.map((d, i) => i + 1) || [], label: 'Day of Month' }],
            series: [
                { data: analytics.dailyTrends?.map(d => d.income) || [], label: 'Inflow', color: '#10b981', area: true, showMark: false },
                { data: analytics.dailyTrends?.map(d => d.expense) || [], label: 'Outflow', color: '#ef4444', showMark: false }
            ]
        };
    }, [analytics, period]);

    return (
        <div className={cn(styles.container, settings.compactMode && styles.compact)}>
            {/* ... Header ... */}
            {/* (Keeping existing header code, just focusing on chart replacement logic below) */}

            {/* Header / Welcome Section - Reusing Dashboard Pattern */}
            <div className={styles.welcomeSection}>
                <div className={styles.welcomeInfo}>
                    <h1 className={styles.welcomeTitle}>Financial Command Center</h1>
                    <p className={styles.welcomeSubtitle}>
                        Survival Status: <span style={{ color: survivalStatus.color, fontWeight: 700 }}>{survivalStatus.label}</span>
                    </p>
                </div>

                <div className={styles.timeSelector}>
                    {/* Factory Quick Filter */}
                    <div className={styles.filterGroup}>
                        <select
                            value={filterFactory}
                            onChange={(e) => setFilterFactory(e.target.value)}
                            className={cn(styles.timeButton, styles.factorySelect)}
                        >
                            <option value="all">All Factories</option>
                            {factories?.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Period Toggle */}
                    <div className={styles.periodToggle}>
                        <button
                            className={cn(styles.periodBtn, period === 'day' && styles.active)}
                            onClick={() => setPeriod('day')}
                        >
                            Today
                        </button>
                        <button
                            className={cn(styles.periodBtn, period === 'month' && styles.active)}
                            onClick={() => setPeriod('month')}
                        >
                            Monthly
                        </button>
                    </div>

                    {/* Month/Year Selector - Only show if period is month */}
                    {period === 'month' && (
                        <div className={styles.periodButtons}>
                            <input
                                type="month"
                                value={`${year}-${String(month).padStart(2, '0')}`}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        const [y, m] = e.target.value.split('-');
                                        setYear(parseInt(y));
                                        setMonth(parseInt(m));
                                    }
                                }}
                                className={styles.timeButton}
                            />
                        </div>
                    )}

                    <button className={styles.refreshButton} onClick={() => setShowCategoryManager(true)} title="Configure Categories">
                        <Settings size={16} />
                    </button>
                    <button className={styles.refreshButton} onClick={handleRefresh} title="Refresh">
                        <RefreshCw size={16} className={loadingAnalytics ? styles.spin : ''} />
                    </button>
                </div>
            </div>

            <div className={styles.pageActions}>
                <button
                    className={cn(styles.actionBtn, styles.incomeBtn)}
                    onClick={() => { setEntryType('income'); setShowEntryModal(true); }}
                >
                    <Plus size={18} />
                    <span>Add Inflow</span>
                </button>
                <button
                    className={cn(styles.actionBtn, styles.expenseBtn)}
                    onClick={() => { setEntryType('expense'); setShowEntryModal(true); }}
                >
                    <Plus size={18} />
                    <span>Add Expense</span>
                </button>
            </div>

            {/* Metric Cards - Reusing MetricCard Component */}
            <div className={styles.metricsGrid}>
                <MetricCard
                    title="Total Inflow"
                    value={formatCurrency(analytics?.totalIncome || 0)}
                    subtitle="Actual cash received"
                    icon={ArrowUpCircle}
                    gradient="linear-gradient(135deg, #10b981, #059669)"
                    trend={analytics?.incomeTrend}
                    trendLabel="vs last month"
                    compact={settings.compactMode}
                />
                <MetricCard
                    title="Total Expenses"
                    value={formatCurrency(analytics?.totalExpense || 0)}
                    subtitle="Operating & ad-hoc costs"
                    icon={ArrowDownCircle}
                    gradient="linear-gradient(135deg, #ef4444, #dc2626)"
                    trend={analytics?.expenseTrend}
                    trendLabel="vs last month"
                    compact={settings.compactMode}
                />
                <MetricCard
                    title="Net Cash Flow"
                    value={formatCurrency(analytics?.netCashFlow || 0)}
                    subtitle="Current liquid position"
                    icon={DollarSign}
                    gradient="linear-gradient(135deg, #3b82f6, #2563eb)"
                    compact={settings.compactMode}
                />
            </div>

            {/* Main Visualizations Grid */}
            <div className={styles.chartsGrid}>
                {/* Cash Flow Trend - Full Width */}
                <div className={cn(styles.chartCard, styles.fullWidth)}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>{period === 'day' ? 'Hourly Cash Velocity' : 'Monthly Cash Velocity'}</h3>
                        <p className={styles.chartSubtitle}>{period === 'day' ? 'Inflows vs Outflows by Hour' : 'Daily comparison of inflows vs outflows'}</p>
                    </div>
                    <div className={styles.chartBody}>
                        {loadingAnalytics ? (
                            <div className={styles.chartLoading}>
                                <RefreshCw className={styles.spin} />
                            </div>
                        ) : (analytics?.dailyTrends?.length > 0 || analytics?.transactions?.length > 0) ? (
                            <LineChart
                                xAxis={chartData.xAxis}
                                series={chartData.series}
                                height={300}
                                margin={{ left: 60, right: 20, top: 20, bottom: 40 }}
                            />
                        ) : (
                            <div className={styles.emptyState}>No transaction data for this period</div>
                        )}
                    </div>
                </div>

                {/* Expense Breakdown */}
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Expense Distribution</h3>
                        <p className={styles.chartSubtitle}>Allocating costs by category</p>
                    </div>
                    <div className={styles.chartBody}>
                        {analytics?.categoryBreakdown?.length > 0 ? (
                            <PieChart
                                series={[{
                                    data: analytics.categoryBreakdown.map((c, i) => ({ id: i, value: c.value, label: c.name })),
                                    innerRadius: 60,
                                    outerRadius: 100,
                                    paddingAngle: 5,
                                    cornerRadius: 4,
                                }]}
                                height={250}
                            />
                        ) : (
                            <div className={styles.emptyState}>No expense records found</div>
                        )}
                    </div>
                </div>

                {/* Daily Ledger - Side Panel Design */}
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <div className={styles.ledgerHeaderTop}>
                            <h3 className={styles.chartTitle}>Daily Ledger</h3>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className={styles.datePicker}
                            />
                        </div>
                    </div>

                    <div className={styles.ledgerTableContainer}>
                        <div className={styles.ledgerTable}>
                            <div className={styles.tableHead}>
                                <span>Category</span>
                                <span style={{ textAlign: 'right' }}>Amount</span>
                            </div>
                            <div className={styles.tableBody}>
                                {loadingDaily ? (
                                    <div className={styles.tableLoading}>
                                        <RefreshCw className={styles.spin} />
                                    </div>
                                ) : dailySheet?.length === 0 ? (
                                    <div className={styles.emptyTable}>Zero movements today</div>
                                ) : (
                                    dailySheet?.map(log => (
                                        <div key={log.id} className={styles.tableRow}>
                                            <div className={styles.logInfo}>
                                                <div className={styles.logCat}>{log.cash_flow_categories.name}</div>
                                                <div className={styles.logMode}>{log.payment_mode}</div>
                                            </div>
                                            <div className={cn(styles.logAmount, log.cash_flow_categories.type === 'income' ? styles.income : styles.expense)}>
                                                {log.cash_flow_categories.type === 'income' ? '+' : '-'}{formatCurrency(log.amount)}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={styles.ledgerFooter}>
                        <div className={styles.dailyBalance}>
                            Daily Net: <span>{formatCurrency(dailySheet?.reduce((acc, curr) =>
                                curr.cash_flow_categories.type === 'income' ? acc + Number(curr.amount) : acc - Number(curr.amount), 0
                            ) || 0)}</span>
                        </div>
                        <button className={styles.exportBtn}>
                            <Download size={14} />
                            CSV
                        </button>
                    </div>
                </div>
            </div>

            {/* Entry Modal */}
            {
                showEntryModal && (
                    <EntryModal
                        type={entryType}
                        onClose={() => setShowEntryModal(false)}
                        onSuccess={() => {
                            queryClient.invalidateQueries(['cash-flow-analytics']);
                            queryClient.invalidateQueries(['cash-flow-daily']);
                            setShowEntryModal(false);
                        }}
                        categories={categories?.filter(c => c.type === entryType)}
                        factories={factories}
                    />
                )
            }

            {/* Category Manager */}
            {
                showCategoryManager && (
                    <CategoryManager onClose={() => setShowCategoryManager(false)} />
                )
            }
        </div >
    );
}

function EntryModal({ type, onClose, onSuccess, categories, factories }) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        date: getLocalDateISO(),
        category_id: '',
        factory_id: factories?.[0]?.id || '',
        amount: '',
        payment_mode: 'Cash',
        notes: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.category_id) return alert('Please select a category');
        setLoading(true);
        try {
            await cashFlowAPI.logEntry({
                ...formData,
                amount: Number(formData.amount)
            });
            onSuccess();
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
                <div className={styles.modalHeader}>
                    <div className={styles.modalTitleIcon}>
                        {type === 'income' ? <ArrowUpCircle color="var(--success)" /> : <ArrowDownCircle color="var(--error)" />}
                        <h2 className={styles.modalTitle}>Add {type === 'income' ? 'Cash Inflow' : 'Expense'}</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Date</label>
                            <input
                                type="date"
                                required
                                className={styles.input}
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Factory</label>
                            <select
                                required
                                className={styles.input}
                                value={formData.factory_id}
                                onChange={e => setFormData({ ...formData, factory_id: e.target.value })}
                                disabled={categories?.find(c => c.id === formData.category_id)?.is_shared}
                            >
                                {categories?.find(c => c.id === formData.category_id)?.is_shared ? (
                                    <option value="">All Factories (Shared)</option>
                                ) : (
                                    factories?.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))
                                )}
                            </select>
                            {categories?.find(c => c.id === formData.category_id)?.is_shared && (
                                <p className={styles.splitHelpText}>
                                    This cost will be split equally across all factories.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Category</label>
                        <select
                            required
                            className={styles.input}
                            value={formData.category_id}
                            onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                        >
                            <option value="">Select Category</option>
                            {categories?.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <div className="flex justify-between items-center mb-1">
                                <label className={styles.label}>Amount</label>
                                {categories?.find(c => c.id === formData.category_id)?.default_amount > 0 && (
                                    <button
                                        type="button"
                                        className={styles.useDefaultBtn}
                                        onClick={() => setFormData({
                                            ...formData,
                                            amount: categories.find(c => c.id === formData.category_id).default_amount.toString()
                                        })}
                                    >
                                        Use Default: {formatCurrency(categories.find(c => c.id === formData.category_id).default_amount)}
                                    </button>
                                )}
                            </div>
                            <input
                                type="number"
                                required
                                className={styles.input}
                                placeholder="0.00"
                                value={formData.amount}
                                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Payment Mode</label>
                            <select
                                className={styles.input}
                                value={formData.payment_mode}
                                onChange={e => setFormData({ ...formData, payment_mode: e.target.value })}
                            >
                                <option value="Cash">Cash</option>
                                <option value="Bank">Bank Transfer</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Notes</label>
                        <textarea
                            rows="2"
                            className={styles.textarea}
                            placeholder="Optional transaction details..."
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        />
                    </div>

                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelLink}>Cancel</button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={cn(styles.submitBtn, type === 'income' ? styles.submitIncome : styles.submitExpense)}
                        >
                            {loading ? <RefreshCw className={styles.spin} size={16} /> : 'Record Transaction'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
