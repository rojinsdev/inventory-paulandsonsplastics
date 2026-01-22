'use client';

import { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';
import styles from './DateTimeWidget.module.css';

export default function DateTimeWidget() {
    const [dateTime, setDateTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setDateTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getShift = (date) => {
        const hour = date.getHours();
        // Day Shift: 8 AM (08:00) to 8 PM (20:00)
        if (hour >= 8 && hour < 20) {
            return 'Day Shift';
        }
        // Night Shift: 8 PM (20:00) to 8 AM (08:00)
        return 'Night Shift';
    };

    const formatDate = (date) => {
        return new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        }).format(date);
    };

    const formatTime = (date) => {
        return new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }).format(date);
    };

    return (
        <div className={styles.container}>
            <div className={styles.group}>
                <Calendar size={14} className={styles.icon} />
                <span className={styles.date}>{formatDate(dateTime)}</span>
            </div>
            <div className={styles.divider} />
            <div className={styles.group}>
                <Clock size={14} className={styles.icon} />
                <div className={styles.timeWrapper}>
                    <span className={styles.time}>{formatTime(dateTime)}</span>
                </div>
            </div>
            <div className={styles.divider} />
            <div className={styles.shiftBadge}>
                {getShift(dateTime)}
            </div>
        </div>
    );
}
