'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Plus, Pencil, Trash2, Loader2, Link2, X, RefreshCw, Factory, Package, CheckCircle } from 'lucide-react';
import { dieMappingsAPI, machinesAPI, productTemplatesAPI } from '@/lib/api';
import { useFactory } from '@/contexts/FactoryContext';
import { useGuide } from '@/contexts/GuideContext';
import CustomSelect from '@/components/ui/CustomSelect';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

export default function DieMappingsPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { selectedFactory } = useFactory();
    const { registerGuide } = useGuide();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingMapping, setEditingMapping] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        machine_id: '',
        product_template_id: '',
        ideal_cycle_time_seconds: '',
        capacity_restriction: '',
        enabled: true,
    });

    // Queries
    const { data: mappings = [], isLoading: mappingsLoading, error: mappingsError } = useQuery({
        queryKey: ['die-mappings', selectedFactory?.id],
        queryFn: () => dieMappingsAPI.getAll(selectedFactory?.id ? { factory_id: selectedFactory.id } : {}).then(res => Array.isArray(res) ? res : []),
    });

    const { data: machines = [], isLoading: machinesLoading } = useQuery({
        queryKey: ['machines', selectedFactory?.id],
        queryFn: () => machinesAPI.getAll(selectedFactory?.id ? { factory_id: selectedFactory.id } : {}).then(res => Array.isArray(res) ? res : []),
    });

    const { data: templates = [], isLoading: templatesLoading } = useQuery({
        queryKey: ['product-templates', selectedFactory?.id],
        queryFn: () => productTemplatesAPI.getAll(selectedFactory?.id ? { factory_id: selectedFactory.id } : {}).then(res => Array.isArray(res) ? res : []),
    });

    const loading = mappingsLoading || machinesLoading || templatesLoading;
    const error = mappingsError?.message;

    // Mutations
    const saveMutation = useMutation({
        mutationFn: (data) => editingMapping
            ? dieMappingsAPI.update(editingMapping.id, data)
            : dieMappingsAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['die-mappings'] });
            setModalOpen(false);
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => dieMappingsAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['die-mappings'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, enabled }) => dieMappingsAPI.update(id, { enabled }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['die-mappings'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const saving = saveMutation.isPending;


    // Load data
    useEffect(() => {
        setPageTitle('Machine-Tub Mapping');
        registerGuide({
            title: "Machine-Tub Mapping",
            description: "Configure performance limits and production speeds for machine-tub pairs.",
            logic: [
                {
                    title: "Cycle Time (Seconds per Piece)",
                    explanation: "This is the speed of your production. It defines how many seconds the machine takes to finish one tub. Lowering this number increases your 'Theoretical Yield' (max possible output)."
                },
                {
                    title: "Capacity Restriction (Hard Limit)",
                    explanation: "If a machine should only produce a certain amount of a specific tub (e.g., due to wear or power limits), set a limit here to prevent the system from over-scheduling it."
                }
            ],
            components: [
                {
                    name: "Mapping Matrix",
                    description: "Shows which machines are cleared to run which tubs."
                },
                {
                    name: "Performance Slider",
                    description: "Mechanism for adjusting speed and restriction parameters based on real-world machine wear."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);



    // Get machine/product name by ID
    const getMachineName = (id) => machines.find((m) => m.id === id)?.name || 'Unknown';
    const getTemplateName = (id) => {
        const t = templates.find((t) => t.id === id);
        return t ? `${t.name} (${t.size})` : 'Unknown';
    };

    // Open modal for create
    const handleCreate = () => {
        setEditingMapping(null);
        setFormData({
            machine_id: machines[0]?.id || '',
            product_template_id: templates[0]?.id || '',
            ideal_cycle_time_seconds: '',
            capacity_restriction: '',
            enabled: true,
        });
        setModalOpen(true);
    };

    // Open modal for edit
    const handleEdit = (mapping) => {
        setEditingMapping(mapping);
        setFormData({
            machine_id: mapping.machine_id || '',
            product_template_id: mapping.product_template_id || '',
            ideal_cycle_time_seconds: mapping.ideal_cycle_time_seconds || '',
            capacity_restriction: mapping.capacity_restriction || '',
            enabled: mapping.enabled !== false,
        });
        setModalOpen(true);
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();

        const payload = {
            ...formData,
            ideal_cycle_time_seconds: Number(formData.ideal_cycle_time_seconds),
            capacity_restriction: formData.capacity_restriction
                ? Number(formData.capacity_restriction)
                : null,
        };

        saveMutation.mutate(payload);
    };

    // Handle delete
    const handleDelete = async (mapping) => {
        const machineName = getMachineName(mapping.machine_id);
        const templateName = getTemplateName(mapping.product_template_id);
        if (!confirm(`Delete mapping: ${machineName} → ${templateName}?`)) return;
        deleteMutation.mutate(mapping.id);
    };

    // Toggle enabled
    const handleToggleEnabled = async (mapping) => {
        statusMutation.mutate({
            id: mapping.id,
            enabled: !mapping.enabled,
        });
    };

    // Calculate stats
    const totalMappings = mappings.length;
    const enabledMappings = mappings.filter((m) => m.enabled !== false).length;

    return (
        <>
            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Machine-Tub Mapping</h1>
                    <p className={styles.pageDescription}>
                        Define which machines can produce which tubs and their cycle times
                    </p>
                </div>
                <button
                    className={styles.primaryButton}
                    onClick={handleCreate}
                    disabled={machines.length === 0 || templates.length === 0}
                >
                    <Plus size={18} />
                    <span>Add Mapping</span>
                </button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Link2 size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{totalMappings}</div>
                        <div className={styles.statLabel}>Total Mappings</div>
                        <div className={styles.statSublabel}>Machine-tub pairs</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Factory size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{machines.length}</div>
                        <div className={styles.statLabel}>Machines</div>
                        <div className={styles.statSublabel}>Available</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{templates.length}</div>
                        <div className={styles.statLabel}>Templates</div>
                        <div className={styles.statSublabel}>In catalog</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <CheckCircle size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{enabledMappings}</div>
                        <div className={styles.statLabel}>Enabled Mappings</div>
                        <div className={styles.statSublabel}>Active configurations</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spinner} />
                        <span>Loading mappings...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <Link2 size={24} />
                        <p>{error}</p>
                        <button className={styles.retryButton} onClick={() => queryClient.invalidateQueries({ queryKey: ['die-mappings'] })}>
                            <RefreshCw size={16} />
                            Retry
                        </button>
                    </div>
                ) : mappings.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Link2 size={48} />
                        <p>No machine-tub mappings configured yet</p>
                        <p className={styles.emptyHint}>
                            {machines.length === 0 || templates.length === 0 ? (
                                'Add machines and tub templates first before creating mappings'
                            ) : (
                                'Create mappings to define which machines can produce which tubs'
                            )}
                        </p>
                        {machines.length > 0 && templates.length > 0 && (
                            <button className={styles.primaryButton} onClick={handleCreate}>
                                <Plus size={18} />
                                <span>Add First Mapping</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Machine</th>
                                    <th>Template</th>
                                    <th>Cycle Time (sec)</th>
                                    <th>Capacity Limit</th>
                                    <th>Enabled</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mappings.map((mapping) => (
                                    <tr key={mapping.id}>
                                        <td className={styles.nameCell}>{getMachineName(mapping.machine_id)}</td>
                                        <td>{getTemplateName(mapping.product_template_id)}</td>
                                        <td className={styles.cycleCell}>{mapping.ideal_cycle_time_seconds}s</td>
                                        <td className={styles.capacityCell}>{mapping.capacity_restriction || '—'}</td>
                                        <td>
                                            <button
                                                className={cn(styles.toggle, mapping.enabled !== false && styles.toggleActive)}
                                                onClick={() => handleToggleEnabled(mapping)}
                                                title={mapping.enabled !== false ? 'Disable' : 'Enable'}
                                            />
                                        </td>
                                        <td>
                                            <div className={styles.actions}>
                                                <button
                                                    className={styles.actionButton}
                                                    onClick={() => handleEdit(mapping)}
                                                    title="Edit"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    className={styles.actionButton}
                                                    onClick={() => handleDelete(mapping)}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className={styles.modalBackdrop} onClick={() => setModalOpen(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                {editingMapping ? 'Edit Mapping' : 'Add Mapping'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Machine *</label>
                                    <CustomSelect
                                        value={formData.machine_id}
                                        onChange={(value) => setFormData({ ...formData, machine_id: value })}
                                        options={machines.map(m => ({
                                            label: `${m.name} (${m.type})`,
                                            value: m.id
                                        }))}
                                        placeholder="Select Machine"
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Tub Template *</label>
                                    <CustomSelect
                                        value={formData.product_template_id}
                                        onChange={(value) => setFormData({ ...formData, product_template_id: value })}
                                        options={templates.map(t => ({
                                            label: `${t.name} (${t.size})`,
                                            value: t.id
                                        }))}
                                        placeholder="Select Tub Template"
                                    />
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Ideal Cycle Time (seconds) *</label>
                                        <input
                                            type="number"
                                            step="any"
                                            className={styles.formInput}
                                            value={formData.ideal_cycle_time_seconds}
                                            onChange={(e) =>
                                                setFormData({ ...formData, ideal_cycle_time_seconds: e.target.value })
                                            }
                                            required
                                            min="0.1"
                                            placeholder="Time to produce one tub"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Capacity Restriction</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            value={formData.capacity_restriction}
                                            onChange={(e) =>
                                                setFormData({ ...formData, capacity_restriction: e.target.value })
                                            }
                                            placeholder="Max daily tubs (optional)"
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={formData.enabled}
                                            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                                        />
                                        <span>Enabled</span>
                                    </label>
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() => setModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className={styles.submitButton} disabled={saving}>
                                    {saving ? (
                                        <>
                                            <Loader2 size={16} className={styles.spinner} />
                                            <span>Saving...</span>
                                        </>
                                    ) : editingMapping ? (
                                        'Update Mapping'
                                    ) : (
                                        'Create Mapping'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
