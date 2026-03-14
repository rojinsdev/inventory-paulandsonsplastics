'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, Package, AlertTriangle, Lightbulb, CheckCircle, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './NotificationDropdown.module.css';

import { fetchAPI } from '@/lib/api';

export default function NotificationDropdown() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const router = useRouter();

    const fetchNotifications = async () => {
        try {
            const data = await fetchAPI('/notifications');
            setNotifications(data);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Refresh every 5 minutes
        const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getIcon = (type) => {
        switch (type) {
            case 'stock': return <AlertTriangle size={18} className={styles.stockIcon} />;
            case 'order': return <Package size={18} className={styles.orderIcon} />;
            case 'plan': return <Lightbulb size={18} className={styles.planIcon} />;
            case 'machine': return <AlertTriangle size={18} className={styles.machineIcon} />;
            default: return <Bell size={18} />;
        }
    };

    const handleNotificationClick = (link) => {
        router.push(link);
        setIsOpen(false);
    };

    return (
        <div className={styles.container} ref={dropdownRef}>
            <button
                className={styles.triggerBtn}
                onClick={() => setIsOpen(!isOpen)}
                title="Notifications"
            >
                <Bell size={20} />
                {notifications.length > 0 && (
                    <span className={styles.badge}>{notifications.length}</span>
                )}
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <h3>Notifications</h3>
                        <span className={styles.count}>{notifications.length} Active</span>
                    </div>

                    <div className={styles.list}>
                        {loading ? (
                            <div className={styles.loading}>Loading...</div>
                        ) : notifications.length > 0 ? (
                            notifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    className={`${styles.item} ${styles[notif.severity]}`}
                                    onClick={() => handleNotificationClick(notif.link)}
                                >
                                    <div className={styles.iconContainer}>
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className={styles.content}>
                                        <div className={styles.itemHeader}>
                                            <span className={styles.title}>{notif.title}</span>
                                            <span className={styles.time}>
                                                {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className={styles.message}>{notif.message}</p>
                                    </div>
                                    <div className={styles.arrow}>
                                        <ExternalLink size={14} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className={styles.empty}>
                                <CheckCircle size={32} className={styles.emptyIcon} />
                                <p>All caught up!</p>
                            </div>
                        )}
                    </div>

                    <div className={styles.footer}>
                        <button onClick={() => setIsOpen(false)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
