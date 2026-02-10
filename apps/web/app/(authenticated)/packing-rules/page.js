'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Save, Loader2, Package, Boxes, Info, RefreshCw } from 'lucide-react';
import { settingsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import styles from './page.module.css';

export default function PackingRulesPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const [success, setSuccess] = useState(false);

    const [settingsState, setSettingsState] = useState({
        default_items_per_packet: 100,
        default_packets_per_bundle: 50,
    });

    // Queries
    const { data: settingsData, isLoading: loading, error: queryError, refetch: loadSettings } = useQuery({
        queryKey: ['system-settings'],
        queryFn: () => settingsAPI.get(),
    });

    const error = queryError?.message;

    // Sync remote data to local state for editing
    useEffect(() => {
        if (settingsData) {
            setSettingsState({
                default_items_per_packet: settingsData.default_items_per_packet || 100,
                default_packets_per_bundle: settingsData.default_packets_per_bundle || 50,
            });
        }
    }, [settingsData]);

    // Mutations
    const saveMutation = useMutation({
        mutationFn: (data) => settingsAPI.update(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system-settings'] });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const saving = saveMutation.isPending;


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
    }, [registerGuide, setPageTitle]);

    const handleSave = async () => {
        saveMutation.mutate(settingsState);
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
                                            value={settingsState.default_items_per_packet}
                                            onChange={(e) =>
                                                setSettingsState({
                                                    ...settingsState,
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
                                            value={settingsState.default_packets_per_bundle}
                                            onChange={(e) =>
                                                setSettingsState({
                                                    ...settingsState,
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
