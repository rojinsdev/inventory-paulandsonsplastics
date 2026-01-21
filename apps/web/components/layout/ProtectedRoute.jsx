'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';
import styles from './ProtectedRoute.module.css';

export default function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push('/login');
        }
    }, [loading, isAuthenticated, router]);

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <Loader2 size={32} className={styles.spinner} />
                <p>Loading...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className={styles.loadingContainer}>
                <Loader2 size={32} className={styles.spinner} />
                <p>Redirecting to login...</p>
            </div>
        );
    }

    return children;
}
