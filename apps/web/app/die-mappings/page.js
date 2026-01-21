'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout';
import { Plus, Pencil, Trash2, Loader2, Link2, X, RefreshCw, Factory, Package, CheckCircle } from 'lucide-react';
import { dieMappingsAPI, machinesAPI, productsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

export default function DieMappingsPage() {
    const { registerGuide } = useGuide();
    const [mappings, setMappings] = useState([]);
    const [machines, setMachines] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingMapping, setEditingMapping] = useState(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        machine_id: '',
        product_id: '',
        cycle_time_seconds: '',
        capacity_restriction: '',
        enabled: true,
    });

    // Load data
    useEffect(() => {
        registerGuide({
            title: "Die & Cycle Time Mapping",
            description: "Configure performance limits and production speeds for machine-product pairs.",
            logic: [
                {
                    title: "Cycle Time (Seconds per Piece)",
                    explanation: "This is the speed of your production. It defines how many seconds the machine takes to finish one item. Lowering this number increases your 'Theoretical Yield' (max possible output)."
                },
                {
                    title: "Capacity Restriction (Hard Limit)",
                    explanation: "If a machine should only produce a certain amount of a specific product (e.g., due to wear or power limits), set a limit here to prevent the system from over-scheduling it."
                }
            ],
            components: [
                {
                    name: "Mapping Matrix",
                    description: "Shows which machines are cleared to run which products."
                },
                {
                    name: "Performance Slider",
                    description: "Mechanism for adjusting speed and restriction parameters based on real-world machine wear."
                }
            ]
        });
        loadData();
    }, [registerGuide]);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [mappingsData, machinesData, productsData] = await Promise.all([
                dieMappingsAPI.getAll().catch(() => []),
                machinesAPI.getAll().catch(() => []),
                productsAPI.getAll().catch(() => []),
            ]);
            setMappings(Array.isArray(mappingsData) ? mappingsData : []);
            setMachines(Array.isArray(machinesData) ? machinesData : []);
            setProducts(Array.isArray(productsData) ? productsData : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Get machine/product name by ID
    const getMachineName = (id) => machines.find((m) => m.id === id)?.name || 'Unknown';
    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size}, ${p.color})` : 'Unknown';
    };

    // Open modal for create
    const handleCreate = () => {
        setEditingMapping(null);
        setFormData({
            machine_id: machines[0]?.id || '',
            product_id: products[0]?.id || '',
            cycle_time_seconds: '',
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
            product_id: mapping.product_id || '',
            cycle_time_seconds: mapping.cycle_time_seconds || '',
            capacity_restriction: mapping.capacity_restriction || '',
            enabled: mapping.enabled !== false,
        });
        setModalOpen(true);
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const payload = {
                ...formData,
                cycle_time_seconds: Number(formData.cycle_time_seconds),
                capacity_restriction: formData.capacity_restriction
                    ? Number(formData.capacity_restriction)
                    : null,
            };

            if (editingMapping) {
                await dieMappingsAPI.update(editingMapping.id, payload);
            } else {
                await dieMappingsAPI.create(payload);
            }

            setModalOpen(false);
            loadData();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // Handle delete
    const handleDelete = async (mapping) => {
        const machineName = getMachineName(mapping.machine_id);
        const productName = getProductName(mapping.product_id);
        if (!confirm(`Delete mapping: ${machineName} → ${productName}?`)) return;

        try {
            await dieMappingsAPI.delete(mapping.id);
            loadData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    // Toggle enabled
    const handleToggleEnabled = async (mapping) => {
        try {
            await dieMappingsAPI.update(mapping.id, {
                enabled: !mapping.enabled,
            });
            loadData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    // Calculate stats
    const totalMappings = mappings.length;
    const enabledMappings = mappings.filter((m) => m.enabled !== false).length;

    return (
        <DashboardLayout title="Die Mappings">
            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Dies & Cycle Time</h1>
                    <p className={styles.pageDescription}>
                        Define which machines can produce which products and their cycle times
                    </p>
                </div>
                <button
                    className={styles.primaryButton}
                    onClick={handleCreate}
                    disabled={machines.length === 0 || products.length === 0}
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
                        <div className={styles.statSublabel}>Machine-product pairs</div>
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
                        <div className={styles.statValue}>{products.length}</div>
                        <div className={styles.statLabel}>Products</div>
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
                        <button className={styles.retryButton} onClick={loadData}>
                            <RefreshCw size={16} />
                            Retry
                        </button>
                    </div>
                ) : mappings.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Link2 size={48} />
                        <p>No die mappings configured yet</p>
                        <p className={styles.emptyHint}>
                            {machines.length === 0 || products.length === 0 ? (
                                'Add machines and products first before creating mappings'
                            ) : (
                                'Create mappings to define which machines can produce which products'
                            )}
                        </p>
                        {machines.length > 0 && products.length > 0 && (
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
                                    <th>Product</th>
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
                                        <td>{getProductName(mapping.product_id)}</td>
                                        <td className={styles.cycleCell}>{mapping.cycle_time_seconds}s</td>
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
                                    <select
                                        className={styles.formSelect}
                                        value={formData.machine_id}
                                        onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
                                        required
                                    >
                                        <option value="">Select Machine</option>
                                        {machines.map((machine) => (
                                            <option key={machine.id} value={machine.id}>
                                                {machine.name} ({machine.type})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Product *</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.product_id}
                                        onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                                        required
                                    >
                                        <option value="">Select Product</option>
                                        {products.map((product) => (
                                            <option key={product.id} value={product.id}>
                                                {product.name} ({product.size}, {product.color})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Cycle Time (seconds) *</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            value={formData.cycle_time_seconds}
                                            onChange={(e) =>
                                                setFormData({ ...formData, cycle_time_seconds: e.target.value })
                                            }
                                            required
                                            min="1"
                                            placeholder="Time to produce one unit"
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
                                            placeholder="Max units (optional)"
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
        </DashboardLayout>
    );
}
