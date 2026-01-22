'use client';

import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import { SearchProvider } from '@/contexts/SearchContext';
import { useUI } from '@/contexts/UIContext';
import styles from '@/components/layout/DashboardLayout.module.css';

export default function AuthenticatedLayout({ children }) {
    const { pageTitle } = useUI();

    return (
        <ProtectedRoute>
            <SearchProvider>
                <div className={styles.layout}>
                    <Sidebar />
                    <div className={styles.main}>
                        <Header title={pageTitle} />
                        <main className={styles.content}>
                            {children}
                        </main>
                    </div>
                </div>
            </SearchProvider>
        </ProtectedRoute>
    );
}
