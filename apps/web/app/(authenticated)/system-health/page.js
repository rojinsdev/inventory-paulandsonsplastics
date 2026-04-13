'use client';

import { useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import SystemHealthMonitor from '@/components/admin/SystemHealthMonitor';
import styles from './page.module.css';

export default function SystemHealthPage() {
    const { setPageTitle } = useUI();

    useEffect(() => {
        setPageTitle('System Health');
    }, [setPageTitle]);

    return (
        <div className={styles.page}>
            <p className={styles.intro}>
                Database-backed metrics and recent error log entries (admin only). Requires the API route{' '}
                <code className={styles.code}>/api/system</code> and Supabase RPCs such as{' '}
                <code className={styles.code}>get_system_health_summary</code>.
            </p>
            <SystemHealthMonitor />
        </div>
    );
}
