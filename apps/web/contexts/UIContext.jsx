'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const UIContext = createContext();

export function UIProvider({ children }) {
    const [pageTitle, setPageTitle] = useState('Dashboard');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sidebar-collapsed');
            return saved === 'true';
        }
        return false;
    });
    const [notifications, setNotifications] = useState([]);
    const notifIdRef = useRef(0);

    const toggleSidebar = () => {
        setIsSidebarCollapsed(prev => {
            const newState = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('sidebar-collapsed', newState);
            }
            return newState;
        });
    };

    const showNotification = useCallback((message, type = 'info') => {
        const id = ++notifIdRef.current;
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 4000);
    }, []);

    const dismissNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    return (
        <UIContext.Provider value={{
            pageTitle,
            setPageTitle,
            isSidebarCollapsed,
            toggleSidebar,
            showNotification,
            notifications,
            dismissNotification,
        }}>
            {children}
            <NotificationStack notifications={notifications} onDismiss={dismissNotification} />
        </UIContext.Provider>
    );
}

const TYPE_STYLES = {
    success: { bg: 'var(--success-bg)', color: 'var(--success-text)', border: 'var(--success)' },
    error:   { bg: 'var(--error-bg)',   color: 'var(--error-text)',   border: 'var(--error)' },
    warning: { bg: 'var(--warning-bg)', color: 'var(--warning-text)', border: 'var(--warning)' },
    info:    { bg: 'var(--indigo-50)',  color: 'var(--indigo-700)',   border: 'var(--primary)' },
};

function NotificationStack({ notifications, onDismiss }) {
    if (!notifications.length) return null;
    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxWidth: '380px',
        }}>
            {notifications.map(n => {
                const s = TYPE_STYLES[n.type] || TYPE_STYLES.info;
                return (
                    <div
                        key={n.id}
                        onClick={() => onDismiss(n.id)}
                        style={{
                            background: s.bg,
                            color: s.color,
                            border: `1px solid ${s.border}`,
                            borderRadius: '10px',
                            padding: '12px 16px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            animation: 'fadeInUp 0.2s ease',
                        }}
                    >
                        {n.message}
                    </div>
                );
            })}
        </div>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (!context) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
}
