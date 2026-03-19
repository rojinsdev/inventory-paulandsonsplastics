'use client';

import React, { createContext, useContext, useState } from 'react';

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

    const toggleSidebar = () => {
        setIsSidebarCollapsed(prev => {
            const newState = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('sidebar-collapsed', newState);
            }
            return newState;
        });
    };

    return (
        <UIContext.Provider value={{
            pageTitle,
            setPageTitle,
            isSidebarCollapsed,
            toggleSidebar
        }}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (!context) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
}
