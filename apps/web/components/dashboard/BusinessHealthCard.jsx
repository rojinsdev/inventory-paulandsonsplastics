import { ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import styles from '@/app/(authenticated)/page.module.css';

/**
 * BusinessHealthCard Component
 * Displays financial high-level insights (Inflow vs Outflow)
 * 
 * @param {Object} props
 * @param {Object} props.data - Financial data (inflow, outflow, balance)
 * @param {string} props.spanClass - Bento span class (expected span2x1)
 */
export default function BusinessHealthCard({ data, spanClass }) {
    if (!data) return null;

    const { inflow = 0, outflow = 0, survivalBalance = 0 } = data;

    return (
        <div className={cn(styles.bentoCard, styles[spanClass])}>
            <div className={styles.cardHeaderArea}>
                <div className={cn(styles.cardIcon, styles.financialIcon)}>
                    <Activity size={20} />
                </div>
                <h3 className={styles.cardTitle}>Business Health Pulse</h3>
            </div>

            <div className={styles.healthGrid}>
                <div className={styles.healthItem}>
                    <div className={styles.healthLabel}>
                        <ArrowUpRight size={14} className={styles.trendUp} />
                        <span>Total Inflow</span>
                    </div>
                    <div className={styles.healthValue}>{formatCurrency(inflow)}</div>
                </div>

                <div className={styles.healthItem}>
                    <div className={styles.healthLabel}>
                        <ArrowDownRight size={14} className={styles.trendDown} />
                        <span>Total Outflow</span>
                    </div>
                    <div className={styles.healthValue}>{formatCurrency(outflow)}</div>
                </div>

                <div className={cn(styles.healthItem, styles.survivalHighlight)}>
                    <div className={styles.healthLabel}>
                        <span>Survival Balance</span>
                    </div>
                    <div className={styles.healthValue}>{formatCurrency(survivalBalance)}</div>
                    <p className={styles.healthSubtitle}>Cash available after expenses</p>
                </div>
            </div>
        </div>
    );
}
