'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout';
import { Plus, Pencil, Trash2, Factory, Loader2, X, RefreshCw } from 'lucide-react';
import { machinesAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatCurrency, cn } from '@/lib/utils';
import styles from './page.module.css';

const MACHINE_TYPES = ['extruder', 'cutting', 'printing', 'packing'];
const MACHINE_CATEGORIES = ['small', 'large', 'other'];

export default function MachinesPage() {
    const { registerGuide } = useGuide();
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        type: 'extruder',
        category: 'small',
        max_die_weight: '',
        daily_running_cost: '7000',
        status: 'active',
    });

    // Load machines
    useEffect(() => {
        registerGuide({
            title: "Machine Configuration",
            description: "Register and manage the physical production line machinery and cost centers.",
            logic: [
                {
                    title: "Status & Availability",
                    explanation: "Setting a machine to 'Inactive' removes it from the Live Dispatch options, preventing production allocation to faulty units."
                },
                {
                    title: "Cost Center (Daily Running Cost)",
                    explanation: "The 'Daily Running Cost' represents fixed overhead (electricity, labor) per day. The system uses this to calculate the cost-per-bundle in your financial reports."
                },
                {
                    title: "Mechanical Limits (Max Die Weight)",
                    explanation: "This defines the heaviest mold the machine can safely operate. The system uses this to filter which products can be manufactured on which machines."
                }
            ],
            components: [
                {
                    name: "Machine Grid",
                    description: "High-level summary of active vs. idle units across the factory floor."
                },
                {
                    name: "Specifications Form",
                    description: "Defines the mechanical limits (e.g., Max Die Weight) used to validate compatible product mappings."
                }
            ]
        });
        loadMachines();
    }, [registerGuide]);

    const loadMachines = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await machinesAPI.getAll();
            setMachines(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Open modal for create
    const handleCreate = () => {
        setEditingMachine(null);
        setFormData({
            name: '',
            type: 'extruder',
            category: 'small',
            max_die_weight: '',
            daily_running_cost: '7000',
            status: 'active',
        });
        setModalOpen(true);
    };

    // Open modal for edit
    const handleEdit = (machine) => {
        setEditingMachine(machine);
        setFormData({
            name: machine.name || '',
            type: machine.type || 'extruder',
            category: machine.category || 'small',
            max_die_weight: machine.max_die_weight || '',
            daily_running_cost: machine.daily_running_cost || '7000',
            status: machine.status || 'active',
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
                max_die_weight: formData.max_die_weight ? Number(formData.max_die_weight) : null,
                daily_running_cost: Number(formData.daily_running_cost),
            };

            if (editingMachine) {
                await machinesAPI.update(editingMachine.id, payload);
            } else {
                await machinesAPI.create(payload);
            }

            setModalOpen(false);
            loadMachines();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // Handle delete
    const handleDelete = async (machine) => {
        if (!confirm(`Delete machine "${machine.name}"?`)) return;

        try {
            await machinesAPI.delete(machine.id);
            loadMachines();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    // Toggle status
    const handleToggleStatus = async (machine) => {
        try {
            await machinesAPI.update(machine.id, {
                status: machine.status === 'active' ? 'inactive' : 'active',
            });
            loadMachines();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    // Calculate stats
    const totalMachines = machines.length;
    const activeMachines = machines.filter((m) => m.status === 'active').length;
    const totalDailyCost = machines.reduce((sum, m) => sum + (m.daily_running_cost || 0), 0);

    return (
        <DashboardLayout title="Machines">
            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Machines</h1>
                    <p className={styles.pageDescription}>
                        Manage production machines and their configurations
                    </p>
                </div>
                <button className={styles.primaryButton} onClick={handleCreate}>
                    <Plus size={18} />
                    <span>Add Machine</span>
                </button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Factory size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{totalMachines}</div>
                        <div className={styles.statLabel}>Total Machines</div>
                        <div className={styles.statSublabel}>Registered</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Factory size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{activeMachines}</div>
                        <div className={styles.statLabel}>Active Machines</div>
                        <div className={styles.statSublabel}>Currently operational</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Factory size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatCurrency(totalDailyCost)}</div>
                        <div className={styles.statLabel}>Total Daily Cost</div>
                        <div className={styles.statSublabel}>Combined running cost</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spinner} />
                        <span>Loading machines...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <Factory size={24} />
                        <p>{error}</p>
                        <button className={styles.retryButton} onClick={loadMachines}>
                            <RefreshCw size={16} />
                            Retry
                        </button>
                    </div>
                ) : machines.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Factory size={48} />
                        <p>No machines configured yet</p>
                        <p className={styles.emptyHint}>
                            Add your first machine to start tracking production
                        </p>
                        <button className={styles.primaryButton} onClick={handleCreate}>
                            <Plus size={18} />
                            <span>Add First Machine</span>
                        </button>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Category</th>
                                    <th>Daily Cost</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {machines.map((machine) => (
                                    <tr key={machine.id}>
                                        <td className={styles.nameCell}>{machine.name}</td>
                                        <td>
                                            <span className={cn(styles.badge, styles[`badge${getTypeBadge(machine.type)}`])}>
                                                {machine.type}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={styles.badgeGray}>{machine.category}</span>
                                        </td>
                                        <td className={styles.costCell}>{formatCurrency(machine.daily_running_cost)}</td>
                                        <td>
                                            <button
                                                className={cn(styles.toggle, machine.status === 'active' && styles.toggleActive)}
                                                onClick={() => handleToggleStatus(machine)}
                                                title={machine.status === 'active' ? 'Deactivate' : 'Activate'}
                                            />
                                        </td>
                                        <td>
                                            <div className={styles.actions}>
                                                <button
                                                    className={styles.actionButton}
                                                    onClick={() => handleEdit(machine)}
                                                    title="Edit"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    className={styles.actionButton}
                                                    onClick={() => handleDelete(machine)}
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
                                {editingMachine ? 'Edit Machine' : 'Add Machine'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Name *</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        placeholder="e.g., Extruder A"
                                    />
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Type *</label>
                                        <select
                                            className={styles.formSelect}
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        >
                                            {MACHINE_TYPES.map((type) => (
                                                <option key={type} value={type}>
                                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Category *</label>
                                        <select
                                            className={styles.formSelect}
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        >
                                            {MACHINE_CATEGORIES.map((cat) => (
                                                <option key={cat} value={cat}>
                                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Max Die Weight (kg)</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            value={formData.max_die_weight}
                                            onChange={(e) => setFormData({ ...formData, max_die_weight: e.target.value })}
                                            placeholder="Optional"
                                            step="0.1"
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Daily Running Cost (₹) *</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            value={formData.daily_running_cost}
                                            onChange={(e) => setFormData({ ...formData, daily_running_cost: e.target.value })}
                                            required
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Status</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
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
                                    ) : editingMachine ? (
                                        'Update Machine'
                                    ) : (
                                        'Create Machine'
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

// Helper to get badge color for machine type
function getTypeBadge(type) {
    const colors = {
        extruder: 'Primary',
        cutting: 'Warning',
        printing: 'Success',
        packing: 'Gray',
    };
    return colors[type] || 'Gray';
}
