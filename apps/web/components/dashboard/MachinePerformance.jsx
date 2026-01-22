'use client';

import { useMemo } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { formatNumber } from '@/lib/utils';
import styles from './Chart.module.css';

export default function MachinePerformance({ data }) {
    const chartData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        return data
            .map(item => ({
                name: item.name || 'Unknown',
                efficiency: Math.round(item.efficiency || 0),
                status: item.status || 'unknown'
            }))
            .sort((a, b) => b.efficiency - a.efficiency);
    }, [data]);

    const getBarColor = (status) => {
        switch (status) {
            case 'active': return '#10b981';
            case 'maintenance': return '#f59e0b';
            case 'idle': return '#6b7280';
            default: return '#6366f1';
        }
    };

    if (!chartData || chartData.length === 0) {
        return (
            <div className={styles.emptyChart}>
                <p>No machine performance data available</p>
            </div>
        );
    }

    return (
        <div className={styles.chartContainer}>
            <BarChart
                dataset={chartData}
                yAxis={[{ scaleType: 'band', dataKey: 'name' }]}
                xAxis={[{
                    label: 'Efficiency (%)',
                    min: 0,
                    max: 100,
                    valueFormatter: (value) => `${value}%`
                }]}
                series={[
                    {
                        dataKey: 'efficiency',
                        label: 'Efficiency',
                        valueFormatter: (value) => `${value}%`,
                        // MUI X Charts doesn't support easy per-bar coloring in the basic configuration
                        // for horizontal bars without a bit more boilerplate or custom slots.
                        // We will use a fallback color or a custom provider if needed, 
                        // but for now we'll stick to a consistent primary color to ensure stability.
                        color: '#6366f1',
                    },
                ]}
                layout="horizontal"
                height={300}
                margin={{ left: 100, right: 30, top: 40, bottom: 40 }}
            />
        </div>
    );
}
