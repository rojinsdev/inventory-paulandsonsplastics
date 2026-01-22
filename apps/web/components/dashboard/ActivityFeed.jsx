'use client';

import { useMemo } from 'react';
import { Activity, Package, ShoppingCart, Boxes, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import styles from './ActivityFeed.module.css';

const activityIcons = {
    production: Activity,
    inventory: Boxes,
    sales: ShoppingCart,
    audit: Package
};

const activityColors = {
    production: '#3b82f6',
    inventory: '#6366f1',
    sales: '#10b981',
    audit: '#6b7280'
};

export default function ActivityFeed({ data }) {
    const activities = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        return data.slice(0, 10); // Show last 10 activities
    }, [data]);

    if (!activities || activities.length === 0) {
        return (
            <div className={styles.emptyFeed}>
                <p>No recent activity</p>
            </div>
        );
    }

    return (
        <div className={styles.feedContainer}>
            {activities.map((activity, index) => {
                const Icon = activityIcons[activity.type] || Activity;
                const color = activityColors[activity.type] || '#6b7280';

                return (
                    <div key={index} className={styles.activityItem}>
                        <div className={styles.activityIcon} style={{ backgroundColor: `${color}20`, color }}>
                            <Icon size={16} />
                        </div>
                        <div className={styles.activityContent}>
                            <div className={styles.activityDescription}>{activity.description}</div>
                            <div className={styles.activityMeta}>
                                {activity.user && (
                                    <span className={styles.activityUser}>{activity.user}</span>
                                )}
                                <span className={styles.activityTime}>
                                    <Clock size={12} />
                                    {formatDateTime(activity.timestamp)}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
