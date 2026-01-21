'use client';

import Sidebar from './Sidebar';
import Header from './Header';
import ProtectedRoute from './ProtectedRoute';
import { SearchProvider } from '@/contexts/SearchContext';
import styles from './DashboardLayout.module.css';

export default function DashboardLayout({ children, title = 'Dashboard' }) {
    return (
        <ProtectedRoute>
            <SearchProvider>
                <div className={styles.layout}>
                    <Sidebar />
                    <div className={styles.main}>
                        <Header title={title} />
                        <main className={styles.content}>
                            {children}
                        </main>
                    </div>
                </div>
            </SearchProvider>
        </ProtectedRoute>
    );
}

