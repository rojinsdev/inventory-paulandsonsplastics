'use client';

import { useState, useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import { Save, Loader2, Package, Boxes, Info, RefreshCw } from 'lucide-react';
import { settingsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import styles from './page.module.css';

export default function PackingRulesPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const [settings, setSettings] = useState({
        default_items_per_packet: 100,
        default_packets_per_bundle: 50,
    });

    // Load settings
    useEffect(() => {
        setPageTitle('Packing Rules');
        registerGuide({
            title: "Global Packing Rules",
            description: "Standardize packaging units across the system to maintain inventory consistency.",
            logic: [
                {
                    title: "System Defaults",
                    explanation: "These values (Items/Packet, Packets/Bundle) are auto-applied to all new product registrations."
                },
                {
                    title: "Operational Consistency",
                    explanation: "Global rules ensure that diverse product lines follow a similar 'Bundle' logic for warehouse stacking and sale."
                }
            ],
            components: [
                {
                    name: "Global Constants Form",
                    description: "Adjust the fundamental packing math for the entire factory."
                },
                {
                    name: "Impact Awareness",
                    description: "Changes here do NOT affect existing products, preventing historical inventory data corruption."
                }
            ]
        });
        loadSettings();
    }, [registerGuide, setPageTitle]);

    const loadSettings = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await settingsAPI.get();
            if (data) {
                setSettings({
                    default_items_per_packet: data.default_items_per_packet || 100,
                    default_packets_per_bundle: data.default_packets_per_bundle || 50,
                });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            await settingsAPI.update(settings);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Packing Rules</h1>
                    <p className={styles.pageDescription}>
                        Configure default packing quantities for new products
                    </p>
                </div>
            </div>

            {/* Info Card */}
            <div className={styles.infoCard}>
                <div className={styles.infoIcon}>
                    <Info size={24} />
                </div>
                <div className={styles.infoContent}>
                    <h3 className={styles.infoTitle}>About Packing Rules</h3>
                    <p className={styles.infoDescription}>
                        These defaults apply when creating new products. Individual products can override
                        these values in the Product settings.
                    </p>
                </div>
            </div>

            {/* Settings Card */}
            <div className={styles.settingsCard}>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spinner} />
                        <span>Loading settings...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <Info size={24} />
                        <p>{error}</p>
                        <button className={styles.retryButton} onClick={loadSettings}>
                            <RefreshCw size={16} />
                            Retry
                        </button>
                    </div>
                ) : (
                    <>
                        <div className={styles.settingsGrid}>
                            {/* Items per Packet */}
                            <div className={styles.settingItem}>
                                <div className={styles.settingIcon}>
                                    <Package size={28} />
                                </div>
                                <div className={styles.settingContent}>
                                    <label className={styles.settingLabel}>Default Items per Packet</label>
                                    <p className={styles.settingDescription}>
                                        Number of loose items packed into a single packet
                                    </p>
                                    <div className={styles.inputWrapper}>
                                        <input
                                            type="number"
                                            className={styles.settingInput}
                                            value={settings.default_items_per_packet}
                                            onChange={(e) =>
                                                setSettings({
                                                    ...settings,
                                                    default_items_per_packet: Number(e.target.value),
                                                })
                                            }
                                            min="1"
                                        />
                                        <span className={styles.inputSuffix}>items</span>
                                    </div>
                                </div>
                            </div>

                            {/* Packets per Bundle */}
                            <div className={styles.settingItem}>
                                <div className={styles.settingIcon}>
                                    <Boxes size={28} />
                                </div>
                                <div className={styles.settingContent}>
                                    <label className={styles.settingLabel}>Default Packets per Bundle</label>
                                    <p className={styles.settingDescription}>
                                        Number of packets grouped into a bundle/sack (sellable unit)
                                    </p>
                                    <div className={styles.inputWrapper}>
                                        <input
                                            type="number"
                                            className={styles.settingInput}
                                            value={settings.default_packets_per_bundle}
                                            onChange={(e) =>
                                                setSettings({
                                                    ...settings,
                                                    default_packets_per_bundle: Number(e.target.value),
                                                })
                                            }
                                            min="1"
                                        />
                                        <span className={styles.inputSuffix}>packets</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className={styles.actions}>
                            {error && <span className={styles.errorText}>Error: {error}</span>}
                            {success && <span className={styles.successText}>Settings saved successfully!</span>}
                            <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
                                {saving ? (
                                    <>
                                        <Loader2 size={16} className={styles.spinner} />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        <span>Save Changes</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
