'use client';

import Sidebar from './Sidebar';
import Header from './Header';
import ProtectedRoute from './ProtectedRoute';
import { SearchProvider } from '@/contexts/SearchContext';
import { FactoryProvider } from '@/contexts/FactoryContext';
import styles from './DashboardLayout.module.css';

export default function DashboardLayout({ children, title = 'Home' }) {
    return (
        <ProtectedRoute>
            <FactoryProvider>
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
            </FactoryProvider>
        </ProtectedRoute>
    );
}

