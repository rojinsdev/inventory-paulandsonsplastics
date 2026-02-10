import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './MetricCard.module.css'; // Reusing base styles but with layout overrides

/**
 * BentoMetric Component
 * Highly flexible metric display for Bento Grid layouts
 * 
 * @param {Object} props
 * @param {string} props.title - Card header
 * @param {string|number} props.value - Primary metric value
 * @param {string} props.subtitle - Contextual text below value
 * @param {React.ElementType} props.icon - Lucide icon component
 * @param {string} props.trend - Percentage or amount trend (e.g. "+12%")
 * @param {boolean} props.isTrendUp - Boolean to determine trend color
 * @param {string} props.spanClass - Bento span class (span2x2, span2x1, span1x1)
 */
export default function BentoMetric({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    isTrendUp,
    spanClass,
    className
}) {
    const TrendIcon = isTrendUp ? TrendingUp : TrendingDown;

    return (
        <div className={cn(styles.bentoCard, styles[spanClass], className)}>
            <div className={styles.cardHeaderArea}>
                {Icon && (
                    <div className={styles.cardIcon}>
                        <Icon size={20} />
                    </div>
                )}
                <h3 className={styles.cardTitle}>{title}</h3>
            </div>

            <div className={styles.cardBodyArea}>
                <div className={styles.cardValue}>{value}</div>
                {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}

                {trend && (
                    <div className={cn(
                        styles.cardTrend,
                        isTrendUp ? styles.trendUp : styles.trendDown
                    )}>
                        <TrendIcon size={12} />
                        <span>{trend}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
