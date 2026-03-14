'use strict';

import React from 'react';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Package,
    Truck,
    BarChart3
} from 'lucide-react';
import styles from './DashboardSummaryBar.module.css';
import { cn } from '@/lib/utils';

/**
 * DashboardSummaryBar Component
 * Executive top-level metrics for the Home dashboard.
 */
const DashboardSummaryBar = ({ data = {} }) => {
    const metrics = [
        {
            label: 'Total Stock Value',
            value: data.stockValue || '₹0',
            trend: '+12.5%',
            isTrendUp: true,
            icon: Package,
            color: 'blue'
        },
        {
            label: 'Revenue (MTD)',
            value: data.revenueMTD || '₹0',
            trend: '+8.2%',
            isTrendUp: true,
            icon: DollarSign,
            color: 'green'
        },
        {
            label: 'Fulfillment Rate',
            value: data.fulfillmentRate || '0%',
            trend: '-2.1%',
            isTrendUp: false,
            icon: Truck,
            color: 'indigo'
        },
        {
            label: 'Avg. Daily Output',
            value: data.dailyOutput || '0',
            trend: '+5.4%',
            isTrendUp: true,
            icon: BarChart3,
            color: 'orange'
        }
    ];

    return (
        <div className={styles.summaryBar}>
            {metrics.map((metric, index) => (
                <div key={index} className={styles.kpiCard}>
                    <div className={cn(styles.iconWrapper, styles[metric.color])}>
                        <metric.icon size={22} />
                    </div>
                    <div className={styles.content}>
                        <span className={styles.label}>{metric.label}</span>
                        <span className={styles.value}>{metric.value}</span>
                        {metric.trend && (
                            <div className={cn(
                                styles.trend,
                                metric.isTrendUp ? styles.trendUp : styles.trendDown
                            )}>
                                {metric.isTrendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {metric.trend}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default DashboardSummaryBar;
