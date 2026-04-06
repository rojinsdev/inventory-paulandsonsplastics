'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUI } from '@/contexts/UIContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Save, Loader2, Settings as SettingsIcon, Info, CheckCircle, XCircle, Search } from 'lucide-react';
import { settingsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { useAuth } from '@/lib/auth';
import styles from './page.module.css';

export default function SystemSettingsPage() {
    const { setPageTitle } = useUI();
    const { settings, updateSetting } = useSettings();
    const { registerGuide } = useGuide();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState(null);

    const [settingsData, setSettingsData] = useState({});
    const [settingsChanges, setSettingsChanges] = useState({});

    // Load settings
    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const data = await settingsAPI.get();
            if (data && typeof data === 'object') {
                setSettingsData(data);
                // Set first category as active if available
                const categories = Object.keys(data);
                if (categories.length > 0 && !activeCategory) {
                    setActiveCategory(categories[0]);
                }
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
            setError('Failed to load settings. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [activeCategory]);

    useEffect(() => {
        setPageTitle('System Settings');
        registerGuide({
            title: "Global System Configuration",
            description: "Master controls for system constants, production rules, and notification thresholds.",
            logic: [
                {
                    title: "The 23-Hour Production Rule",
                    explanation: "This setting reserves 1 hour per day for machine maintenance and cooling. It ensures that 'Theoretical Capacity' (max possible output) is realistic and achievable."
                },
                {
                    title: "Global Sync Architecture",
                    explanation: "These are master switches. Changing a value here (like the default 'Waste %') ripple through all production plans and inventory math across the entire system immediately."
                }
            ],
            components: [
                {
                    name: "Config Navigator",
                    description: "Searchable breakdown of settings by category: Production, Alerts, Inventory, etc."
                },
                {
                    name: "Staging Bar",
                    description: "Review pending changes before committing them. Shows a live count of unsaved modifications."
                }
            ]
        });
        loadSettings();
    }, [registerGuide, setPageTitle, loadSettings]);

    const handleSettingChange = (key, value) => {
        setSettingsChanges(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleSave = async () => {
        if (Object.keys(settingsChanges).length === 0) {
            setError('No changes to save');
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            // Update each changed setting
            const updatePromises = Object.entries(settingsChanges).map(([key, value]) =>
                settingsAPI.updateValue(key, value)
            );

            await Promise.all(updatePromises);

            // Reload settings to get updated values
            await loadSettings();
            setSettingsChanges({});
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError(err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const hasChanges = Object.keys(settingsChanges).length > 0;

    // Filter settings based on search query
    const filteredCategories = Object.entries(settingsData).filter(([category, settings]) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return category.toLowerCase().includes(query) ||
            settings.some(s =>
                s.display_name?.toLowerCase().includes(query) ||
                s.description?.toLowerCase().includes(query) ||
                s.key?.toLowerCase().includes(query)
            );
    });

    const getSettingValue = (setting) => {
        const changedValue = settingsChanges[setting.key];
        if (changedValue !== undefined) return changedValue;
        return setting.value;
    };

    const getCategoryIcon = (category) => {
        const icons = {
            production: '⚙️',
            inventory: '📦',
            alerts: '🔔',
            general: '⚙️',
            system: '🖥️',
        };
        return icons[category.toLowerCase()] || '⚙️';
    };

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>System Settings</h1>
                    <p className={styles.pageDescription}>
                        Configure system-wide operational parameters and preferences
                    </p>
                </div>
            </div>

            {/* Search Bar */}
            {!loading && Object.keys(settingsData).length > 0 && (
                <div className={styles.searchBar}>
                    <Search size={20} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search settings..."
                        className={styles.searchInput}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            )}

            {/* Info Banner */}
            <div className={styles.infoBanner}>
                <Info size={20} />
                <div>
                    <strong>System Configuration</strong>
                    <p>
                        These settings affect production calculations, alerts, and business rules across
                        the entire system. Changes take effect immediately after saving.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <Loader2 size={32} className={styles.spinner} />
                    <span>Loading settings...</span>
                </div>
            ) : error && Object.keys(settingsData).length === 0 ? (
                <div className={styles.error}>
                    <XCircle size={24} />
                    <p>{error}</p>
                    <button className="btn btn-secondary" onClick={loadSettings}>
                        Retry
                    </button>
                </div>
            ) : (
                <>
                    {/* UI Preferences (Stored Locally) */}
                    {(!searchQuery || 
                      'ui preferences auto-refresh dashboard compact mode'.toLowerCase().includes(searchQuery.toLowerCase())) && (
                        <div className={styles.categoryCard} style={{ marginBottom: '2rem' }}>
                            <div className={styles.categoryHeader}>
                                <span className={styles.categoryIcon}>🖥️</span>
                                <h2 className={styles.categoryTitle}>UI Preferences</h2>
                            </div>
                            <div className={styles.settingsGrid}>
                                <div className={styles.settingItem}>
                                    <div className={styles.settingContent}>
                                        <div className={styles.settingHeader}>
                                            <label className={styles.settingLabel}>Dashboard Auto-Refresh</label>
                                        </div>
                                        <p className={styles.settingDescription}>
                                            Automatically refresh the dashboard main content to keep data up-to-date.
                                        </p>
                                        <div className={styles.inputWrapper}>
                                            <select 
                                                className={styles.input}
                                                value={settings.autoRefreshInterval || 0}
                                                onChange={(e) => updateSetting('autoRefreshInterval', Number(e.target.value))}
                                            >
                                                <option value={0}>Disabled</option>
                                                <option value={30000}>Every 30 Seconds</option>
                                                <option value={60000}>Every 1 Minute</option>
                                                <option value={300000}>Every 5 Minutes</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.settingItem}>
                                    <div className={styles.settingContent}>
                                        <div className={styles.settingHeader}>
                                            <label className={styles.settingLabel}>Compact Mode</label>
                                        </div>
                                        <p className={styles.settingDescription}>
                                            Use a more compact layout for the sidebar and content.
                                        </p>
                                        <div className={styles.inputWrapper}>
                                            <label className={styles.toggle}>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.compactMode}
                                                    onChange={(e) => updateSetting('compactMode', e.target.checked)}
                                                />
                                                <span className={styles.toggleSlider}></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {filteredCategories.length === 0 ? (
                        <div className={styles.emptyState}>
                            <SettingsIcon size={48} />
                            <p>No system settings found</p>
                            <p className="text-muted">Try adjusting your search query</p>
                        </div>
                    ) : (
                        <div className={styles.categoriesContainer}>
                        {filteredCategories.map(([category, settings]) => (
                            <div key={category} className={styles.categoryCard}>
                                <div className={styles.categoryHeader}>
                                    <span className={styles.categoryIcon}>{getCategoryIcon(category)}</span>
                                    <h2 className={styles.categoryTitle}>
                                        {category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')}
                                    </h2>
                                </div>
                                <div className={styles.settingsGrid}>
                                    {settings.map((setting) => {
                                        const currentValue = getSettingValue(setting);
                                        const hasChange = settingsChanges[setting.key] !== undefined;

                                        return (
                                            <div key={setting.key} className={`${styles.settingItem} ${hasChange ? styles.settingItemChanged : ''}`}>
                                                <div className={styles.settingContent}>
                                                    <div className={styles.settingHeader}>
                                                        <label className={styles.settingLabel}>
                                                            {setting.display_name || setting.key}
                                                        </label>
                                                        {!setting.is_editable && (
                                                            <span className={styles.readOnlyBadge}>Read Only</span>
                                                        )}
                                                    </div>
                                                    {setting.description && (
                                                        <p className={styles.settingDescription}>{setting.description}</p>
                                                    )}
                                                    <div className={styles.inputWrapper}>
                                                        {setting.data_type === 'boolean' ? (
                                                            <label className={styles.toggle}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={currentValue || false}
                                                                    onChange={(e) => handleSettingChange(setting.key, e.target.checked)}
                                                                    disabled={!setting.is_editable}
                                                                />
                                                                <span className={styles.toggleSlider}></span>
                                                            </label>
                                                        ) : setting.data_type === 'number' ? (
                                                            <>
                                                                <input
                                                                    type="number"
                                                                    className={styles.input}
                                                                    value={currentValue ?? ''}
                                                                    onChange={(e) => handleSettingChange(setting.key, Number(e.target.value))}
                                                                    disabled={!setting.is_editable}
                                                                    placeholder="Enter value"
                                                                />
                                                            </>
                                                        ) : (
                                                            <input
                                                                type="text"
                                                                className={styles.input}
                                                                value={currentValue ?? ''}
                                                                onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                                                                disabled={!setting.is_editable}
                                                                placeholder="Enter value"
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        </div>
                    )}

                    {/* Save Actions Bar */}
                    {hasChanges && (
                        <div className={styles.saveBar}>
                            <div className={styles.saveBarContent}>
                                {error && (
                                    <div className={styles.errorMessage}>
                                        <XCircle size={16} />
                                        <span>{error}</span>
                                    </div>
                                )}
                                {success && (
                                    <div className={styles.successMessage}>
                                        <CheckCircle size={16} />
                                        <span>Settings saved successfully!</span>
                                    </div>
                                )}
                                <div className={styles.saveActions}>
                                    <span className={styles.changesCount}>
                                        {Object.keys(settingsChanges).length} change{Object.keys(settingsChanges).length !== 1 ? 's' : ''} pending
                                    </span>
                                    <button
                                        className={styles.saveButton}
                                        onClick={handleSave}
                                        disabled={saving}
                                    >
                                        {saving ? (
                                            <>
                                                <Loader2 size={16} className={styles.spinner} />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save size={16} />
                                                Save Changes
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
