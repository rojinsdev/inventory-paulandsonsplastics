'use client';

import { useMemo } from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import { formatNumber, formatCurrency } from '@/lib/utils';
import styles from './Chart.module.css';

export default function SalesChart({ data }) {
    const chartData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        return data.map(item => ({
            date: new Date(item.date),
            orders: item.orders || 0,
            revenue: item.revenue || 0
        }));
    }, [data]);

    if (!chartData || chartData.length === 0) {
        return (
            <div className={styles.emptyChart}>
                <p>No sales data available for the selected period</p>
            </div>
        );
    }

    return (
        <div className={styles.chartContainer}>
            <LineChart
                dataset={chartData}
                xAxis={[
                    {
                        dataKey: 'date',
                        scaleType: 'time',
                        valueFormatter: (date) =>
                            date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
                    },
                ]}
                yAxis={[
                    { id: 'orders', label: 'Orders' },
                    { id: 'revenue', label: 'Revenue', orientation: 'right' },
                ]}
                series={[
                    {
                        dataKey: 'orders',
                        label: 'Orders',
                        color: '#10b981',
                        yAxisId: 'orders',
                        showMark: true,
                    },
                    {
                        dataKey: 'revenue',
                        label: 'Revenue',
                        color: '#3b82f6',
                        yAxisId: 'revenue',
                        showMark: true,
                        valueFormatter: (value) => formatCurrency(value),
                    },
                ]}
                height={300}
                margin={{ left: 50, right: 70, top: 40, bottom: 40 }}
                slotProps={{
                    legend: {
                        direction: 'row',
                        position: { vertical: 'top', horizontal: 'middle' },
                        padding: -5,
                    },
                }}
            />
        </div>
    );
}
