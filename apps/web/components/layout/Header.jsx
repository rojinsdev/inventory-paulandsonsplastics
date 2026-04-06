'use client';

import Image from 'next/image';
import { useAuth } from '@/lib/auth';

import { useSettings } from '@/contexts/SettingsContext';
import { useFactory } from '@/contexts/FactoryContext';
import { User, Bell, Zap, HelpCircle, Calendar as CalendarIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AVAILABLE_QUICK_ACTIONS } from '@/lib/constants';
import { usePathname, useRouter } from 'next/navigation';
import SettingsModal from '../ui/SettingsModal';

import DateTimeWidget from '../ui/DateTimeWidget';
import FactoryFilter from '../ui/FactoryFilter';
import OrderCalendarModal from '../ui/OrderCalendarModal';
import NotificationDropdown from '../ui/NotificationDropdown';
import styles from './Header.module.css';


export default function Header({ title }) {
    const { user } = useAuth();
    const { settings } = useSettings();
    const { selectedFactory, setSelectedFactory } = useFactory();
    const [showSettings, setShowSettings] = useState(false);
    const [showQuickActions, setShowQuickActions] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);

    const quickActionsRef = useRef(null);
    const router = useRouter();
    const pathname = usePathname();

    // Close quick actions when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (quickActionsRef.current && !quickActionsRef.current.contains(event.target)) {
                setShowQuickActions(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    // Get context-aware action button
    // Removed from sales screens and product config screens per user request
    const getNewAction = () => {
        // Sales screens - no button
        if (pathname.includes('/orders') ||
            pathname.includes('/customers') ||
            pathname.includes('/deliveries') ||
            pathname.includes('/inventory/live')) {
            return null;
        }

        // Product config screens - no button
        if (pathname.includes('/products') ||
            pathname.includes('/machines') ||
            pathname.includes('/die-mappings') ||
            pathname.includes('/packing-rules')) {
            return null;
        }

        return null;
    };

    const newAction = getNewAction();

    return (
        <header className={styles.header}>
            {/* System Status / Clock Widget */}
            <div className={styles.searchContainer}>
                <DateTimeWidget />
            </div>

            {/* Actions */}
            <div className={styles.actions}>
                {user?.role === 'admin' &&
                    !pathname.includes('/orders') &&
                    !pathname.includes('/deliveries') &&
                    !pathname.includes('/payments') &&
                    !pathname.includes('/reports/cash-flow') &&
                    !pathname.includes('/customers') &&
                    <FactoryFilter value={selectedFactory} onChange={setSelectedFactory} />}

                {/* Calendar Trigger - Visible everywhere */}
                <button
                    className={styles.iconBtn}
                    onClick={() => setShowCalendar(true)}
                    title="Order Calendar"
                >
                    <CalendarIcon size={20} />
                </button>
                <NotificationDropdown />


                <div ref={quickActionsRef} style={{ position: 'relative' }}>
                    <button
                        className={styles.iconBtn}
                        onClick={() => setShowQuickActions(!showQuickActions)}
                        title="Quick Actions"
                    >
                        <Zap size={20} />
                    </button>

                    {showQuickActions && (
                        <div className={styles.quickActionsDropdown}>
                            {AVAILABLE_QUICK_ACTIONS.filter(action => settings.quickActions?.[action.id]).length > 0 ? (
                                AVAILABLE_QUICK_ACTIONS.filter(action => settings.quickActions?.[action.id]).map(action => {
                                    const Icon = action.icon;
                                    return (
                                        <button
                                            key={action.id}
                                            className={styles.quickActionItem}
                                            onClick={() => {
                                                router.push(action.href);
                                                setShowQuickActions(false);
                                            }}
                                        >
                                            <Icon size={18} className={styles.quickActionIcon} />
                                            <div className={styles.quickActionInfo}>
                                                <span className={styles.quickActionLabel}>{action.label}</span>
                                                <span className={styles.quickActionSubtitle}>{action.subtitle}</span>
                                            </div>
                                        </button>
                                    );
                                })
                            ) : (
                                <div className={styles.quickActionEmpty}>
                                    No actions enabled.<br />Check Settings.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className={styles.userInfo}>
                    <button
                        className={styles.userAvatar}
                        onClick={() => setShowSettings(true)}
                        aria-label="Open settings"
                    >
                        <Image
                            src="/assets/avatar.png"
                            alt="User Avatar"
                            width={32}
                            height={32}
                            className={styles.avatarImg}
                        />
                    </button>
                </div>
            </div>

            {/* Modals */}
            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
            <OrderCalendarModal isOpen={showCalendar} onClose={() => setShowCalendar(false)} />

        </header>
    );
}
