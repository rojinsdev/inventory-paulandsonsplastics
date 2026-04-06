"use client";

import { useSettings } from '@/contexts/SettingsContext';
import styles from '@/components/layout/DashboardLayout.module.css';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import { FactoryProvider } from '@/contexts/FactoryContext';
import { SearchProvider } from '@/contexts/SearchContext';
import { cn } from '@/lib/utils';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

export default function AuthenticatedLayout({ children }) {
    const { pageTitle } = useUI();
    const { settings } = useSettings();
    const router = useRouter();
    const pathname = usePathname();

    // Handle Default View Redirect
    useEffect(() => {
        // Only redirect if at the root and defaultView is set and different
        if (pathname === '/' && settings.defaultView && settings.defaultView !== '/') {
            router.push(settings.defaultView);
        }
    }, [pathname, settings.defaultView, router]);

    // Handle Auto-Refresh
    useEffect(() => {
        if (!settings.autoRefreshInterval || settings.autoRefreshInterval <= 0) return;

        const interval = setInterval(() => {
            console.log(`[AutoRefresh] Refreshing at ${new Date().toLocaleTimeString()}`);
            router.refresh();
        }, settings.autoRefreshInterval);

        return () => clearInterval(interval);
    }, [settings.autoRefreshInterval, router]);

    return (
        <ProtectedRoute>
            <FactoryProvider>
                <SearchProvider>
                    <div className={cn(styles.layout, settings.compactMode && styles.compact)}>
                        <Sidebar />
                        <div className={styles.main}>
                            <Header title={pageTitle} />
                            <main className={cn(styles.content, settings.compactMode && styles.compactContent)}>
                                {children}
                            </main>
                        </div>
                    </div>
                </SearchProvider>
            </FactoryProvider>
        </ProtectedRoute>
    );
}
