'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const SettingsContext = createContext(undefined);

const DEFAULT_SETTINGS = {
    defaultView: '/',
    notifications: true,
    compactMode: false,
    visibleMetrics: {
        // Production
        productionAchievement: true,
        outputToday: true,
        overallEfficiency: true,
        activeMachines: true,
        costRecovered: true,

        // Inventory
        inventoryAlerts: true,
        finishedGoods: true,
        rawMaterial: true,
        stockValue: true,

        // Sales / Financials
        businessHealthCard: true,
        revenuePerformance: true,
        ordersQueue: true,
        todayDeliveries: true,
        activeCustomers: true,
    },
    quickActions: {
        newSale: true,
        addCustomer: true,
        logProduction: true,
        checkStock: true,
        analytics: true,
        deliveries: false,
        products: false,
    },
};

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [mounted, setMounted] = useState(false);

    // Load settings from localStorage on mount
    useEffect(() => {
        const savedSettings = localStorage.getItem('dashboard-settings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            } catch (e) {
                console.error('Failed to parse settings', e);
                setSettings(DEFAULT_SETTINGS);
            }
        }
        setMounted(true);
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem('dashboard-settings', JSON.stringify(settings));
    }, [settings, mounted]);

    // Update a specific setting
    const updateSetting = (key, value) => {
        setSettings((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    // Update multiple settings at once
    const updateSettings = (newSettings) => {
        setSettings((prev) => ({
            ...prev,
            ...newSettings,
        }));
    };

    // Reset to default settings
    const resetSettings = () => {
        setSettings(DEFAULT_SETTINGS);
        localStorage.removeItem('dashboard-settings');
    };

    const value = {
        settings,
        updateSetting,
        updateSettings,
        resetSettings,
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
