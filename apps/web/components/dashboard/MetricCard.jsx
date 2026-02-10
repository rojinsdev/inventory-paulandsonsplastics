'use client';

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { formatNumber, cn } from '@/lib/utils';
import styles from './MetricCard.module.css';

export default function MetricCard({
    title,
    value,
    subtitle,
    icon: Icon,
    gradient,
    trend,
    trendLabel,
    onClick,
    compact
}) {
    const TrendIcon = trend && trend > 0 ? TrendingUp : TrendingDown;
    const trendClass = trend && trend > 0 ? styles.trendUp : styles.trendDown;

    return (
        <div className={cn(styles.metricCard, compact && styles.compact)} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
            <div className={styles.iconWrapper} style={{ background: gradient }}>
                <Icon size={compact ? 20 : 28} />
            </div>
            <div className={styles.content}>
                <div className={styles.value}>
                    {typeof value === 'number' ? formatNumber(value) : value}
                </div>
                <div className={styles.title}>{title}</div>
                {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
                {trend !== undefined && trend !== null && (
                    <div className={styles.trend}>
                        <TrendIcon size={14} className={trendClass} />
                        <span className={trendClass}>{Math.abs(trend)}%</span>
                        {trendLabel && <span className={styles.trendLabel}>{trendLabel}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}
