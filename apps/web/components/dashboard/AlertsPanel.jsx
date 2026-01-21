'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, Wrench, ShoppingCart, Calendar, ArrowRight } from 'lucide-react';
import styles from './AlertsPanel.module.css';

export default function AlertsPanel({ alerts }) {
    const router = useRouter();

    if (!alerts) {
        return null;
    }

    const { lowStock, machinesNeedingAttention, pendingOrders, upcomingDeliveries } = alerts;

    const totalAlerts = 
        lowStock.length + 
        machinesNeedingAttention.length + 
        pendingOrders.length + 
        upcomingDeliveries.length;

    if (totalAlerts === 0) {
        return (
            <div className={styles.alertsCard}>
                <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Alerts & Reminders</h3>
                </div>
                <div className={styles.emptyAlerts}>
                    <p>All systems operating normally. No alerts at this time.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.alertsCard}>
            <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Alerts & Reminders</h3>
                <span className={styles.alertCount}>{totalAlerts}</span>
            </div>

            <div className={styles.alertsList}>
                {/* Low Stock Alerts */}
                {lowStock.length > 0 && (
                    <div className={styles.alertSection}>
                        <div className={styles.sectionHeader}>
                            <AlertTriangle className={styles.sectionIcon} size={18} />
                            <h4 className={styles.sectionTitle}>Low Stock Warnings</h4>
                        </div>
                        <div className={styles.alertItems}>
                            {lowStock.slice(0, 3).map((item) => (
                                <div 
                                    key={item.materialId} 
                                    className={styles.alertItem}
                                    onClick={() => router.push('/inventory/raw-materials')}
                                >
                                    <div className={styles.alertContent}>
                                        <span className={styles.alertText}>{item.name}</span>
                                        <span className={styles.alertDetail}>
                                            {item.currentStock} kg (threshold: {item.threshold} kg)
                                        </span>
                                    </div>
                                    <ArrowRight size={16} className={styles.alertArrow} />
                                </div>
                            ))}
                            {lowStock.length > 3 && (
                                <div className={styles.moreAlerts}>
                                    +{lowStock.length - 3} more
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Machines Needing Attention */}
                {machinesNeedingAttention.length > 0 && (
                    <div className={styles.alertSection}>
                        <div className={styles.sectionHeader}>
                            <Wrench className={styles.sectionIcon} size={18} />
                            <h4 className={styles.sectionTitle}>Machines Needing Attention</h4>
                        </div>
                        <div className={styles.alertItems}>
                            {machinesNeedingAttention.slice(0, 3).map((item) => (
                                <div 
                                    key={item.machineId} 
                                    className={styles.alertItem}
                                    onClick={() => router.push('/production/machines')}
                                >
                                    <div className={styles.alertContent}>
                                        <span className={styles.alertText}>{item.name}</span>
                                        <span className={styles.alertDetail}>
                                            {item.status === 'maintenance' 
                                                ? 'Maintenance required' 
                                                : `Efficiency: ${item.efficiency}%`}
                                        </span>
                                    </div>
                                    <ArrowRight size={16} className={styles.alertArrow} />
                                </div>
                            ))}
                            {machinesNeedingAttention.length > 3 && (
                                <div className={styles.moreAlerts}>
                                    +{machinesNeedingAttention.length - 3} more
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Pending Orders */}
                {pendingOrders.length > 0 && (
                    <div className={styles.alertSection}>
                        <div className={styles.sectionHeader}>
                            <ShoppingCart className={styles.sectionIcon} size={18} />
                            <h4 className={styles.sectionTitle}>Pending Orders</h4>
                        </div>
                        <div className={styles.alertItems}>
                            {pendingOrders.slice(0, 3).map((item) => (
                                <div 
                                    key={item.orderId} 
                                    className={styles.alertItem}
                                    onClick={() => router.push('/orders')}
                                >
                                    <div className={styles.alertContent}>
                                        <span className={styles.alertText}>{item.customerName}</span>
                                        <span className={styles.alertDetail}>
                                            {item.daysPending} day{item.daysPending !== 1 ? 's' : ''} pending
                                        </span>
                                    </div>
                                    <ArrowRight size={16} className={styles.alertArrow} />
                                </div>
                            ))}
                            {pendingOrders.length > 3 && (
                                <div className={styles.moreAlerts}>
                                    +{pendingOrders.length - 3} more
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Upcoming Deliveries */}
                {upcomingDeliveries.length > 0 && (
                    <div className={styles.alertSection}>
                        <div className={styles.sectionHeader}>
                            <Calendar className={styles.sectionIcon} size={18} />
                            <h4 className={styles.sectionTitle}>Upcoming Deliveries</h4>
                        </div>
                        <div className={styles.alertItems}>
                            {upcomingDeliveries.slice(0, 3).map((item) => (
                                <div 
                                    key={item.orderId} 
                                    className={styles.alertItem}
                                    onClick={() => router.push('/orders')}
                                >
                                    <div className={styles.alertContent}>
                                        <span className={styles.alertText}>{item.customerName}</span>
                                        <span className={styles.alertDetail}>
                                            {item.daysUntil === 0 
                                                ? 'Today' 
                                                : item.daysUntil === 1 
                                                    ? 'Tomorrow' 
                                                    : `In ${item.daysUntil} days`}
                                        </span>
                                    </div>
                                    <ArrowRight size={16} className={styles.alertArrow} />
                                </div>
                            ))}
                            {upcomingDeliveries.length > 3 && (
                                <div className={styles.moreAlerts}>
                                    +{upcomingDeliveries.length - 3} more
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
