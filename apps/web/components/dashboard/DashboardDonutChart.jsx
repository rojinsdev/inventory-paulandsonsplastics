'use client';

import { PieChart } from '@mui/x-charts/PieChart';
import styles from './Chart.module.css';

export default function DashboardDonutChart({ data, title, height = 250 }) {
    if (!data || data.length === 0) {
        return (
            <div className={styles.emptyChart}>
                <p>No data available</p>
            </div>
        );
    }

    return (
        <div className={styles.chartWrapper}>
            {title && <h4 className={styles.chartTitle}>{title}</h4>}
            <PieChart
                series={[
                    {
                        data: data.map((item, index) => ({
                            id: index,
                            value: item.value,
                            label: item.label,
                            color: item.color,
                        })),
                        innerRadius: 60,
                        outerRadius: 100,
                        paddingAngle: 5,
                        cornerRadius: 5,
                        cx: 100,
                    },
                ]}
                height={height}
                slotProps={{
                    legend: {
                        direction: 'column',
                        position: { vertical: 'middle', horizontal: 'right' },
                        labelStyle: {
                            fontSize: 12,
                            fill: 'var(--text-muted)',
                        },
                    },
                }}
            />
        </div>
    );
}
