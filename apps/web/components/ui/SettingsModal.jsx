'use client';

import { useState, useEffect } from 'react';
import { X, Sun, Moon, Monitor, Check, Factory, Activity, TrendingUp, IndianRupee, Package, Boxes, AlertTriangle, ShoppingCart, Truck, Users, Zap } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { AVAILABLE_QUICK_ACTIONS } from '@/lib/constants';
import styles from './SettingsModal.module.css';

const TABS = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'actions', label: 'Quick Actions' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'about', label: 'About' },
];

const METRIC_DEFINITIONS = [
    // Graphs & Trends
    { id: 'productionAchievement', label: 'Production Chart', icon: TrendingUp, category: 'Graphs & Trends' },
    { id: 'businessHealthCard', label: 'Financial Pulse', icon: IndianRupee, category: 'Graphs & Trends' },

    // Dashboard Widgets
    { id: 'revenuePerformance', label: 'Revenue Widget', icon: IndianRupee, category: 'Dashboard Widgets' },
    { id: 'overallEfficiency', label: 'Efficiency Widget', icon: Activity, category: 'Dashboard Widgets' },
    { id: 'ordersQueue', label: 'Orders Widget', icon: ShoppingCart, category: 'Dashboard Widgets' },
    { id: 'outputToday', label: 'Output Widget', icon: Package, category: 'Dashboard Widgets' },
    { id: 'inventoryAlerts', label: 'Alerts Widget', icon: AlertTriangle, category: 'Dashboard Widgets' },

    // Production Metrics
    { id: 'activeMachines', label: 'Active Machines', icon: Activity, category: 'Production' },
    { id: 'costRecovered', label: 'Cost Recovered', icon: IndianRupee, category: 'Production' },

    // Inventory Metrics
    { id: 'finishedGoods', label: 'Finished Goods', icon: Package, category: 'Inventory' },
    { id: 'rawMaterial', label: 'Raw Material', icon: Boxes, category: 'Inventory' },
    { id: 'stockValue', label: 'Stock Value', icon: IndianRupee, category: 'Inventory' },

    // Sales Metrics
    { id: 'todayDeliveries', label: 'Today\'s Deliveries', icon: Truck, category: 'Sales' },
    { id: 'activeCustomers', label: 'Active Customers', icon: Users, category: 'Sales' },
];

export default function SettingsModal({ isOpen, onClose }) {
    const { theme, setTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const [activeTab, setActiveTab] = useState('appearance');

    const toggleMetric = (metricId) => {
        const newVisibleMetrics = {
            ...settings.visibleMetrics,
            [metricId]: !settings.visibleMetrics[metricId]
        };
        updateSetting('visibleMetrics', newVisibleMetrics);
    };

    const toggleCategory = (category, value) => {
        const metricsInCategory = METRIC_DEFINITIONS.filter(m => m.category === category);
        const newVisibleMetrics = { ...settings.visibleMetrics };
        metricsInCategory.forEach(m => {
            newVisibleMetrics[m.id] = value;
        });
        updateSetting('visibleMetrics', newVisibleMetrics);
    };

    const toggleAction = (actionId) => {
        const newQuickActions = {
            ...settings.quickActions,
            [actionId]: !settings.quickActions[actionId]
        };
        updateSetting('quickActions', newQuickActions);
    };

    // Close on ESC key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Sidebar */}
                <div className={styles.sidebar}>
                    <div className={styles.sidebarHeader}>
                        <h2 className={styles.sidebarTitle}>Settings</h2>
                    </div>
                    <div className={styles.tabs}>
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className={styles.mainContent}>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
                        <X size={20} />
                    </button>
                    <div className={styles.content}>
                        {activeTab === 'appearance' && (
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Theme</h3>
                                <p className={styles.sectionDesc}>
                                    Choose your preferred theme for the dashboard
                                </p>
                                <div className={styles.themeOptions}>
                                    <ThemeOption
                                        icon={<Sun size={20} />}
                                        label="Light"
                                        description="Bright and clean interface"
                                        isActive={theme === 'light'}
                                        onClick={() => setTheme('light')}
                                    />
                                    <ThemeOption
                                        icon={<Moon size={20} />}
                                        label="Dark"
                                        description="Easy on the eyes"
                                        isActive={theme === 'dark'}
                                        onClick={() => setTheme('dark')}
                                    />
                                    <ThemeOption
                                        icon={<Monitor size={20} />}
                                        label="System"
                                        description="Follow system preference"
                                        isActive={theme === 'system'}
                                        onClick={() => setTheme('system')}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'dashboard' && (
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Layout</h3>
                                <p className={styles.sectionDesc}>
                                    Customize your dashboard layout preferences
                                </p>
                                <div className={styles.settingItem}>
                                    <div className={styles.settingInfo}>
                                        <div className={styles.settingLabel}>Compact Mode</div>
                                        <div className={styles.settingHint}>
                                            Reduce spacing for more content
                                        </div>
                                    </div>
                                    <label className={styles.toggle}>
                                        <input
                                            type="checkbox"
                                            checked={settings.compactMode}
                                            onChange={(e) => updateSetting('compactMode', e.target.checked)}
                                        />
                                        <span className={styles.toggleSlider}></span>
                                    </label>
                                </div>

                                <h3 className={styles.sectionTitle} style={{ marginTop: '2rem' }}>
                                    Default View
                                </h3>
                                <div className={styles.settingItem}>
                                    <div className={styles.settingInfo}>
                                        <div className={styles.settingLabel}>Starting Page</div>
                                        <div className={styles.settingHint}>
                                            Page to show when you log in
                                        </div>
                                    </div>
                                    <select
                                        className={styles.select}
                                        value={settings.defaultView}
                                        onChange={(e) => updateSetting('defaultView', e.target.value)}
                                    >
                                        <option value="/">Dashboard</option>
                                        <option value="/orders">Sales Orders</option>
                                        <option value="/machines">Machines</option>
                                    </select>
                                </div>

                                <h3 className={styles.sectionTitle} style={{ marginTop: '2rem' }}>
                                    Dashboard Components
                                </h3>
                                <p className={styles.sectionDesc}>
                                    Toggle visibility for charts, graphs, and metric widgets
                                </p>

                                {Array.from(new Set(METRIC_DEFINITIONS.map(m => m.category))).map(category => {
                                    const metricsInCategory = METRIC_DEFINITIONS.filter(m => m.category === category);
                                    const selectedCount = metricsInCategory.filter(m => settings.visibleMetrics?.[m.id]).length;
                                    const allSelected = selectedCount === metricsInCategory.length;

                                    return (
                                        <div key={category} className={styles.metricCategory}>
                                            <div className={styles.categoryHeader}>
                                                <div className={styles.categoryTitle}>
                                                    {category} Metrics
                                                    <span className={styles.metricCount}>
                                                        {selectedCount} of {metricsInCategory.length}
                                                    </span>
                                                </div>
                                                <div className={styles.categoryActions}>
                                                    <button
                                                        className={styles.categoryBtn}
                                                        onClick={() => toggleCategory(category, true)}
                                                        disabled={allSelected}
                                                    >
                                                        All
                                                    </button>
                                                    <button
                                                        className={styles.categoryBtn}
                                                        onClick={() => toggleCategory(category, false)}
                                                        disabled={selectedCount === 0}
                                                    >
                                                        None
                                                    </button>
                                                </div>
                                            </div>
                                            <div className={styles.metricCheckboxGroup}>
                                                {metricsInCategory.map(metric => {
                                                    const Icon = metric.icon;
                                                    return (
                                                        <label key={metric.id} className={styles.metricCheckbox}>
                                                            <input
                                                                type="checkbox"
                                                                checked={settings.visibleMetrics?.[metric.id] || false}
                                                                onChange={() => toggleMetric(metric.id)}
                                                            />
                                                            <div className={styles.metricCheckboxContent}>
                                                                <div className={styles.metricIcon}>
                                                                    <Icon size={16} />
                                                                </div>
                                                                <span className={styles.metricLabel}>{metric.label}</span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'actions' && (
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Quick Actions</h3>
                                <p className={styles.sectionDesc}>
                                    Select the actions to appear in the header for quick access
                                </p>
                                <div className={styles.metricCheckboxGroup}>
                                    {AVAILABLE_QUICK_ACTIONS.map(action => {
                                        const Icon = action.icon;
                                        return (
                                            <label key={action.id} className={styles.metricCheckbox}>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.quickActions?.[action.id] || false}
                                                    onChange={() => toggleAction(action.id)}
                                                />
                                                <div className={styles.metricCheckboxContent}>
                                                    <div className={styles.metricIcon}>
                                                        <Icon size={16} />
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span className={styles.metricLabel}>{action.label}</span>
                                                        <span className={styles.metricDesc} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{action.subtitle}</span>
                                                    </div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {activeTab === 'notifications' && (
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Notification Preferences</h3>
                                <p className={styles.sectionDesc}>
                                    Manage how you receive notifications
                                </p>
                                <div className={styles.settingItem}>
                                    <div className={styles.settingInfo}>
                                        <div className={styles.settingLabel}>Enable Notifications</div>
                                        <div className={styles.settingHint}>
                                            Receive alerts for important events
                                        </div>
                                    </div>
                                    <label className={styles.toggle}>
                                        <input
                                            type="checkbox"
                                            checked={settings.notifications}
                                            onChange={(e) => updateSetting('notifications', e.target.checked)}
                                        />
                                        <span className={styles.toggleSlider}></span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {activeTab === 'about' && (
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>System Information</h3>
                                <div className={styles.infoGrid}>
                                    <div className={styles.infoItem}>
                                        <div className={styles.infoLabel}>Application</div>
                                        <div className={styles.infoValue}>
                                            Paul & Sons Plastics Admin Portal
                                        </div>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <div className={styles.infoLabel}>Version</div>
                                        <div className={styles.infoValue}>1.0.0</div>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <div className={styles.infoLabel}>Environment</div>
                                        <div className={styles.infoValue}>
                                            {process.env.NODE_ENV || 'production'}
                                        </div>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <div className={styles.infoLabel}>Last Updated</div>
                                        <div className={styles.infoValue}>January 2026</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ThemeOption({ icon, label, description, isActive, onClick }) {
    return (
        <button
            className={`${styles.themeOption} ${isActive ? styles.themeOptionActive : ''}`}
            onClick={onClick}
        >
            <div className={styles.themeIcon}>{icon}</div>
            <div className={styles.themeLabel}>{label}</div>
            <div className={styles.themeDesc}>{description}</div>
            {isActive && (
                <div className={styles.activeCheck}>
                    <Check size={16} />
                </div>
            )}
        </button>
    );
}
