'use client';

import { BarChart } from '@mui/x-charts/BarChart';
import styles from './Chart.module.css';

export default function DashboardBarChart({ data, xAxisKey, yAxisKey, label, color = '#3b82f6', height = 250 }) {
    if (!data || data.length === 0) {
        return (
            <div className={styles.emptyChart}>
                <p>No data available</p>
            </div>
        );
    }

    return (
        <div className={styles.chartContainer}>
            <BarChart
                dataset={data}
                xAxis={[
                    {
                        scaleType: 'band',
                        dataKey: xAxisKey,
                        tickLabelStyle: {
                            fontSize: 10,
                            angle: 45,
                            textAnchor: 'start',
                        },
                    },
                ]}
                series={[
                    {
                        dataKey: yAxisKey,
                        label: label,
                        color: color,
                        valueFormatter: (value) => `${value}%`,
                    },
                ]}
                height={height}
                borderRadius={8}
                margin={{ top: 10, bottom: 50, left: 40, right: 10 }}
            />
        </div>
    );
}
