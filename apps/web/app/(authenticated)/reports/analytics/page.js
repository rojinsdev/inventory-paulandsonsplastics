'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUI } from '@/contexts/UIContext';
import MetricCard from '@/components/dashboard/MetricCard';
import {
    TrendingDown,
    Scale,
    Clock,
    Activity,
    AlertTriangle,
    Factory,
    Calendar,
    RefreshCw,
    X,
} from 'lucide-react';
import { PieChart } from '@mui/x-charts/PieChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { BarChart } from '@mui/x-charts/BarChart';
import { analyticsAPI } from '@/lib/api';

import styles from './analytics.module.css';
import { useFactory } from '@/contexts/FactoryContext'; // Import Context

const TIME_PERIODS = [
    { label: 'Today', value: 'today' },
    { label: 'Last 7 Days', value: '7' },
    { label: 'Last 30 Days', value: '30' },
    { label: 'This Month', value: 'month' },
    { label: 'Custom', value: 'custom' },
];

export default function AnalyticsPage() {
    const { setPageTitle } = useUI();
    const [loading, setLoading] = useState(true);
    const [timePeriod, setTimePeriod] = useState('today'); // Set default to Today
    const [showCustomDateRange, setShowCustomDateRange] = useState(false);
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const { selectedFactory } = useFactory(); // Use Global Context

    // State for all analytics data
    const [summary, setSummary] = useState(null);
    const [cycleTimeLoss, setCycleTimeLoss] = useState(null);
    const [weightWastage, setWeightWastage] = useState(null);
    const [downtimeBreakdown, setDowntimeBreakdown] = useState(null);
    const [machineEfficiency, setMachineEfficiency] = useState(null);
    const [shiftComparison, setShiftComparison] = useState(null);

    const getDateRange = useCallback(() => {
        const today = new Date();
        const start = new Date();
        const end = new Date();

        switch (timePeriod) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case '7':
                start.setDate(today.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case '30':
                start.setDate(today.getDate() - 30);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'month':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'custom':
                if (!customStartDate || !customEndDate) return null;
                return {
                    start_date: customStartDate,
                    end_date: customEndDate,
                };
            default:
                return null;
        }

        return {
            start_date: start.toISOString().split('T')[0],
            end_date: end.toISOString().split('T')[0],
        };
    }, [timePeriod, customStartDate, customEndDate]);

    const fetchAllAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            const dateRange = getDateRange();
            if (!dateRange) return;

            const params = {
                start_date: dateRange.start_date,
                end_date: dateRange.end_date,
            };

            if (selectedFactory) {
                params.factory_id = selectedFactory;
            }

            const [summaryData, cycleData, weightData, downtimeData, efficiencyData, shiftData] =
                await Promise.all([
                    analyticsAPI.getSummary(params),
                    analyticsAPI.getCycleTimeLoss(params),
                    analyticsAPI.getWeightWastage(params),
                    analyticsAPI.getDowntimeBreakdown(params),
                    analyticsAPI.getMachineEfficiency(params),
                    analyticsAPI.getShiftComparison(params),
                ]);

            setSummary(summaryData);
            setCycleTimeLoss(cycleData);
            setWeightWastage(weightData);
            setDowntimeBreakdown(downtimeData);
            setMachineEfficiency(efficiencyData);
            setShiftComparison(shiftData);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setLoading(false);
        }
    }, [getDateRange, selectedFactory]);

    const handleCustomDateApply = useCallback(() => {
        setShowCustomDateRange(false);
        fetchAllAnalytics();
    }, [fetchAllAnalytics]);

    useEffect(() => {
        setPageTitle('Tub Production Analytics');
        fetchAllAnalytics();
    }, [timePeriod, selectedFactory, fetchAllAnalytics, setPageTitle]);

    if (loading) {
        return (
            <>
                <div className={styles.loading}>
                    <RefreshCw className={styles.spinner} size={32} />
                    <span>Loading analytics...</span>
                </div>
            </>
        );
    }

    return (
        <>
            {/* Header */}
            <div className={styles.welcomeSection}>
                <div>
                    <h1 className={styles.welcomeTitle}>Tub Production Analytics</h1>
                    <p className={styles.welcomeSubtitle}>
                        Detailed insights into cycle time losses, material wastage, and downtime
                    </p>
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
                    <button className={styles.refreshButton} onClick={fetchAllAnalytics} title="Refresh">
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* Custom Date Range */}
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
                                setTimePeriod('7');
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Summary Metrics */}
            <div className={styles.metricsGrid}>
                <MetricCard
                    title="Units Lost (Cycle Time)"
                    value={summary?.total_units_lost_to_cycle?.toLocaleString() || 0}
                    subtitle="Due to slow cycles"
                    icon={TrendingDown}
                    gradient="linear-gradient(135deg, #ef4444, #dc2626)"
                />
                <MetricCard
                    title="Material Wastage"
                    value={`${summary?.total_weight_wastage_kg?.toFixed(2) || 0} kg`}
                    subtitle="Excess weight used"
                    icon={Scale}
                    gradient="linear-gradient(135deg, #f59e0b, #d97706)"
                />
                <MetricCard
                    title="Total Downtime"
                    value={`${Math.floor((summary?.total_downtime_minutes || 0) / 60)}h ${(summary?.total_downtime_minutes || 0) % 60}m`}
                    subtitle="Machine idle time"
                    icon={Clock}
                    gradient="linear-gradient(135deg, #3b82f6, #2563eb)"
                />
                <MetricCard
                    title="Total Tubs Produced"
                    value={summary?.total_production?.toLocaleString() || 0}
                    subtitle="Tubs produced"
                    icon={Activity}
                    gradient="linear-gradient(135deg, #10b981, #059669)"
                />
                <MetricCard
                    title="Flagged Sessions"
                    value={summary?.flagged_sessions || 0}
                    subtitle="5%+ variance"
                    icon={AlertTriangle}
                    gradient="linear-gradient(135deg, #ff5722, #e64a19)"
                />
                <MetricCard
                    title="Total Sessions"
                    value={summary?.total_sessions || 0}
                    subtitle="Production entries"
                    icon={Factory}
                    gradient="linear-gradient(135deg, #8b5cf6, #7c3aed)"
                />
            </div>

            {/* Charts Grid */}
            <div className={styles.chartsGrid}>
                {/* Downtime Breakdown - Pie Chart */}
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Downtime Breakdown</h3>
                        <span className={styles.chartSubtitle}>By reason</span>
                    </div>
                    {downtimeBreakdown?.breakdown?.length > 0 ? (
                        <PieChart
                            series={[
                                {
                                    data: downtimeBreakdown.breakdown.map((item, index) => ({
                                        id: index,
                                        value: item.total_minutes,
                                        label: item.reason,
                                    })),
                                },
                            ]}
                            height={300}
                        />
                    ) : (
                        <div className={styles.emptyState}>No downtime data</div>
                    )}
                </div>

                {/* Shift Comparison - Bar Chart */}
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Shift Performance</h3>
                        <span className={styles.chartSubtitle}>Day vs Night efficiency</span>
                    </div>
                    {shiftComparison && (
                        <BarChart
                            xAxis={[{ scaleType: 'band', data: ['Shift 1 (Day)', 'Shift 2 (Night)'] }]}
                            series={[
                                {
                                    label: 'Avg Efficiency (%)',
                                    data: [
                                        shiftComparison.shift_1?.avg_efficiency || 0,
                                        shiftComparison.shift_2?.avg_efficiency || 0,
                                    ],
                                },
                            ]}
                            height={300}
                        />
                    )}
                </div>

                {/* Machine Efficiency Trends */}
                <div className={`${styles.chartCard} ${styles.fullWidth}`}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>Machine Efficiency Trends</h3>
                        <span className={styles.chartSubtitle}>Performance over time</span>
                    </div>
                    {machineEfficiency?.machines?.length > 0 ? (
                        <div className={styles.machineCharts}>
                            {machineEfficiency.machines.slice(0, 3).map((machine) => (
                                <div key={machine.machine_id} className={styles.machineChart}>
                                    <p className={styles.machineTitle}>
                                        {machine.machine_name} - Avg: {machine.avg_efficiency}%
                                    </p>
                                    <LineChart
                                        xAxis={[
                                            {
                                                scaleType: 'point',
                                                data: machine.data_points.map((dp) => `${dp.date} S${dp.shift}`),
                                            },
                                        ]}
                                        series={[
                                            {
                                                data: machine.data_points.map((dp) => dp.efficiency),
                                                color: '#8b5cf6',
                                            },
                                        ]}
                                        height={200}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>No efficiency data</div>
                    )}
                </div>
            </div>

            {/* Data Tables */}
            <div className={styles.tableSection}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Top Cycle Time Loss Sessions</h3>
                    <p className={styles.sectionSubtitle}>Sessions with highest unit losses</p>
                </div>
                {cycleTimeLoss?.sessions?.length > 0 ? (
                    <div className={styles.tableContainer}>
                        <table className={styles.dataTable}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Shift</th>
                                    <th>Machine</th>
                                    <th>Tub</th>
                                    <th>Units Lost</th>
                                    <th>Actual Cycle Time</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cycleTimeLoss.sessions.slice(0, 10).map((session) => (
                                    <tr key={session.id}>
                                        <td>{session.date}</td>
                                        <td>Shift {session.shift_number}</td>
                                        <td>{session.machines?.name}</td>
                                        <td>
                                            {session.products?.name} ({session.products?.size} - {session.products?.color})
                                        </td>
                                        <td>
                                            <span className={styles.badge} style={{ background: '#ef4444' }}>
                                                {session.units_lost_to_cycle}
                                            </span>
                                        </td>
                                        <td>{session.actual_cycle_time_seconds}s</td>
                                        <td>
                                            {session.flagged_for_review && (
                                                <span className={styles.badge} style={{ background: '#f59e0b' }}>
                                                    Flagged
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={styles.emptyMetrics}>
                        <p>No significant cycle time losses detected!</p>
                    </div>
                )}
            </div>

            <div className={styles.tableSection}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Top Weight Wastage Sessions</h3>
                    <p className={styles.sectionSubtitle}>Sessions with highest material wastage</p>
                </div>
                {weightWastage?.sessions?.length > 0 ? (
                    <div className={styles.tableContainer}>
                        <table className={styles.dataTable}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Shift</th>
                                    <th>Machine</th>
                                    <th>Tub</th>
                                    <th>Wastage (kg)</th>
                                    <th>Actual Weight</th>
                                    <th>Ideal Weight</th>
                                </tr>
                            </thead>
                            <tbody>
                                {weightWastage.sessions.slice(0, 10).map((session) => (
                                    <tr key={session.id}>
                                        <td>{session.date}</td>
                                        <td>Shift {session.shift_number}</td>
                                        <td>{session.machines?.name}</td>
                                        <td>
                                            {session.products?.name} ({session.products?.size} - {session.products?.color})
                                        </td>
                                        <td>
                                            <span className={styles.badge} style={{ background: '#f59e0b' }}>
                                                {session.weight_wastage_kg?.toFixed(2)} kg
                                            </span>
                                        </td>
                                        <td>{session.actual_weight_grams}g</td>
                                        <td>{session.products?.weight_grams}g</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={styles.emptyMetrics}>
                        <p>No significant weight wastage detected!</p>
                    </div>
                )}
            </div>
        </>
    );
}
