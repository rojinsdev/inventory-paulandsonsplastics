'use client';

import { useMemo } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import styles from './Chart.module.css';

export default function ProductionChart({ data, timePeriod, compact }) {
    const { chartData, comparisons } = useMemo(() => {
        if (!data || !Array.isArray(data)) return { chartData: [], comparisons: null };

        const processed = data.map(item => ({
            date: new Date(item.date),
            actual: item.actual || 0,
            theoretical: item.theoretical || 0,
            efficiency: Math.round(item.efficiency || 0)
        }));

        // Calculate comparisons
        let comparisons = null;
        if (processed.length > 0) {
            const today = processed[processed.length - 1];
            const yesterday = processed.length > 1 ? processed[processed.length - 2] : null;

            let lastWeekAvg = null;
            if (processed.length >= 7) {
                const lastWeekData = processed.slice(-7, -1);
                lastWeekAvg = lastWeekData.reduce((sum, d) => sum + d.actual, 0) / lastWeekData.length;
            }

            comparisons = {
                vsYesterday: yesterday ? {
                    value: today.actual - yesterday.actual,
                    percent: yesterday.actual > 0
                        ? Math.round(((today.actual - yesterday.actual) / yesterday.actual) * 100)
                        : 0
                } : null,
                vsLastWeek: lastWeekAvg !== null ? {
                    value: today.actual - lastWeekAvg,
                    percent: lastWeekAvg > 0
                        ? Math.round(((today.actual - lastWeekAvg) / lastWeekAvg) * 100)
                        : 0
                } : null
            };
        }

        return { chartData: processed, comparisons };
    }, [data]);

    if (!chartData || chartData.length === 0) {
        return (
            <div className={styles.emptyChart}>
                <p>No production data available for the selected period</p>
            </div>
        );
    }

    return (
        <div className={styles.chartWrapper}>
            {/* Comparison Indicators */}
            {comparisons && (comparisons.vsYesterday || comparisons.vsLastWeek) && (
                <div className={styles.comparisons}>
                    {comparisons.vsYesterday && (
                        <div className={styles.comparisonItem}>
                            <span className={styles.comparisonLabel}>vs Yesterday:</span>
                            <div className={`${styles.comparisonValue} ${comparisons.vsYesterday.value >= 0 ? styles.positive : styles.negative
                                }`}>
                                {comparisons.vsYesterday.value >= 0 ? (
                                    <TrendingUp size={14} />
                                ) : (
                                    <TrendingDown size={14} />
                                )}
                                <span>{Math.abs(comparisons.vsYesterday.percent)}%</span>
                            </div>
                        </div>
                    )}
                    {comparisons.vsLastWeek && (
                        <div className={styles.comparisonItem}>
                            <span className={styles.comparisonLabel}>vs Last Week Avg:</span>
                            <div className={`${styles.comparisonValue} ${comparisons.vsLastWeek.value >= 0 ? styles.positive : styles.negative
                                }`}>
                                {comparisons.vsLastWeek.value >= 0 ? (
                                    <TrendingUp size={14} />
                                ) : (
                                    <TrendingDown size={14} />
                                )}
                                <span>{Math.abs(comparisons.vsLastWeek.percent)}%</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
            <div className={styles.chartContainer}>
                <BarChart
                    dataset={chartData}
                    xAxis={[
                        {
                            dataKey: 'date',
                            scaleType: 'band',
                            valueFormatter: (date) =>
                                date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
                        },
                    ]}
                    yAxis={[
                        { id: 'production', label: 'Tubs' },
                        { id: 'efficiency', label: 'Efficiency %', position: 'right', max: 100, min: 0 }
                    ]}
                    series={[
                        {
                            dataKey: 'actual',
                            label: 'Actual Production',
                            color: '#3b82f6',
                            valueFormatter: (value) => `${formatNumber(value)} tubs`,
                            yAxisId: 'production'
                        },
                        {
                            type: 'line',
                            dataKey: 'theoretical',
                            label: 'Theoretical Max',
                            color: '#94a3b8',
                            valueFormatter: (value) => `${formatNumber(value)} tubs`,
                            yAxisId: 'production',
                            strokeDasharray: '5 5',
                        },
                        {
                            type: 'line',
                            dataKey: 'efficiency',
                            label: 'Efficiency %',
                            color: '#10b981',
                            valueFormatter: (value) => `${value}%`,
                            yAxisId: 'efficiency'
                        },
                        // Add Yesterday Pace line if available
                        comparisons?.vsYesterday ? {
                            type: 'line',
                            dataKey: 'yesterdayPace',
                            label: 'Yesterday Pace',
                            color: '#f59e0b', // Amber/Yellow for pace reference
                            valueFormatter: (value) => `${formatNumber(value)} tubs`,
                            yAxisId: 'production',
                            strokeDasharray: '3 3',
                        } : null
                    ].filter(Boolean)}
                    height={compact ? 220 : 300}
                    margin={{ left: 60, right: 60, top: compact ? 20 : 40, bottom: compact ? 30 : 40 }}
                    slotProps={{
                        legend: {
                            direction: 'row',
                            position: { vertical: 'top', horizontal: 'middle' },
                            padding: -5,
                        },
                    }}
                />
            </div>
        </div>
    );
}
