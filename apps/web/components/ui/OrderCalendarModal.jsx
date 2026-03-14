'use client';

import { useState, useMemo } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    isToday,
    parseISO
} from 'date-fns';
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Package, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ordersAPI } from '@/lib/api';
import { useFactory } from '@/contexts/FactoryContext';
import styles from './OrderCalendarModal.module.css';
import { cn } from '@/lib/utils';

export default function OrderCalendarModal({ isOpen, onClose }) {
    const { selectedFactory } = useFactory();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());

    // Fetch all orders
    // In a real app with many orders, we'd want to fetch by range
    // But for now, client-side filtering is fine as per plan
    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['orders', 'calendar', selectedFactory],
        queryFn: () => ordersAPI.getAll({
            ...(selectedFactory ? { factory_id: selectedFactory } : {}),
            size: 1000
        }).then(res => res?.orders || (Array.isArray(res) ? res : [])),
        enabled: isOpen
    });

    // Calendar Generation Logic
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        return eachDayOfInterval({
            start: startDate,
            end: endDate
        });
    }, [currentMonth]);

    // Group orders by date
    const ordersByDate = useMemo(() => {
        const map = new Map();
        orders.forEach(order => {
            if (!order.delivery_date) return;
            // Ensure we handle date strings correctly (YYYY-MM-DD)
            const dateKey = order.delivery_date.split('T')[0];

            if (!map.has(dateKey)) {
                map.set(dateKey, []);
            }
            map.get(dateKey).push(order);
        });
        return map;
    }, [orders]);

    const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

    if (!isOpen) return null;

    const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
    const selectedDateOrders = ordersByDate.get(selectedDateKey) || [];

    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerTitle}>
                        <CalendarIcon size={20} className={styles.headerIcon} />
                        <h2>Order Schedule</h2>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.body}>
                    {/* Calendar Section */}
                    <div className={styles.calendarSection}>
                        <div className={styles.monthNav}>
                            <button onClick={handlePrevMonth} className={styles.navBtn}>
                                <ChevronLeft size={20} />
                            </button>
                            <h3 className={styles.currentMonth}>
                                {format(currentMonth, 'MMMM yyyy')}
                            </h3>
                            <button onClick={handleNextMonth} className={styles.navBtn}>
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <div className={styles.weekDays}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className={styles.weekDay}>{day}</div>
                            ))}
                        </div>

                        <div className={styles.daysGrid}>
                            {calendarDays.map((day, idx) => {
                                const dateKey = format(day, 'yyyy-MM-dd');
                                const dayOrders = ordersByDate.get(dateKey);
                                const hasOrders = dayOrders && dayOrders.length > 0;
                                const isSelected = isSameDay(day, selectedDate);
                                const isCurrentMonth = isSameMonth(day, currentMonth);

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedDate(day)}
                                        className={cn(
                                            styles.dayCell,
                                            !isCurrentMonth && styles.outsideMonth,
                                            isSelected && styles.selectedDay,
                                            isToday(day) && styles.today
                                        )}
                                    >
                                        <span className={styles.dayNumber}>{format(day, 'd')}</span>
                                        {hasOrders && (
                                            <div className={styles.orderIndicators}>
                                                {dayOrders.slice(0, 3).map((_, i) => (
                                                    <div key={i} className={styles.dot} />
                                                ))}
                                                {dayOrders.length > 3 && (
                                                    <span className={styles.moreDot}>+</span>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Details Section */}
                    <div className={styles.detailsSection}>
                        <div className={styles.detailsHeader}>
                            <h3>Deadline Details</h3>
                            <span className={styles.selectedDateLabel}>
                                {format(selectedDate, 'EEEE, MMMM do')}
                            </span>
                        </div>

                        <div className={styles.ordersList}>
                            {isLoading ? (
                                <div className={styles.emptyState}>Loading...</div>
                            ) : selectedDateOrders.length > 0 ? (
                                selectedDateOrders.map(order => (
                                    <div key={order.id} className={styles.orderCard}>
                                        <div className={styles.orderHeader}>
                                            <span className={styles.orderId}>#{order.id.slice(-6).toUpperCase()}</span>
                                            <span className={cn(styles.badge, styles[order.status])}>
                                                {order.status}
                                            </span>
                                        </div>
                                        <div className={styles.orderInfo}>
                                            <div className={styles.infoRow}>
                                                <User size={14} />
                                                <span>{order.customers?.name || 'Unknown Customer'}</span>
                                            </div>
                                            <div className={styles.infoRow}>
                                                <Package size={14} />
                                                <span>{(order.items || order.sales_order_items)?.length || 0} Items</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.emptyState}>
                                    <div className={styles.emptyIcon}>
                                        <Clock size={32} />
                                    </div>
                                    <p>No orders due on this date</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
