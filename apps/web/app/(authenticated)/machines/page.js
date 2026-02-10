'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Factory, Loader2, X, RefreshCw } from 'lucide-react';
import { machinesAPI } from '@/lib/api';
import { useFactory } from '@/contexts/FactoryContext';
import { useGuide } from '@/contexts/GuideContext';
import { formatCurrency, cn } from '@/lib/utils';
import { useUI } from '@/contexts/UIContext';
import CustomSelect from '@/components/ui/CustomSelect';
import FactorySelect from '@/components/ui/FactorySelect';
import styles from './page.module.css';

const MACHINE_TYPES = [
    { value: 'extruder', label: 'Extruder' },
    { value: 'cutting', label: 'Cutting' },
    { value: 'printing', label: 'Printing' },
    { value: 'packing', label: 'Packing' },
];

const MACHINE_CATEGORIES = [
    { value: 'small', label: 'Small' },
    { value: 'large', label: 'Large' },
    { value: 'other', label: 'Other' },
];

export default function MachinesPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        type: 'extruder',
        category: 'small',
        max_die_weight: '',
        daily_running_cost: '7000',
        status: 'active',
        factory_id: '',
    });

    // Queries
    const { data: machines = [], isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['machines', selectedFactory],
        queryFn: () => {
            const params = selectedFactory ? { factory_id: selectedFactory } : {};
            return machinesAPI.getAll(params).then(res => Array.isArray(res) ? res : []);
        },
    });

    const error = queryError?.message;

    // Mutations
    const saveMutation = useMutation({
        mutationFn: (data) => editingMachine
            ? machinesAPI.update(editingMachine.id, data)
            : machinesAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['machines'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setModalOpen(false);
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => machinesAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['machines'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status }) => machinesAPI.update(id, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['machines'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const saving = saveMutation.isPending;


    // Load machines
    useEffect(() => {
        setPageTitle('Machines');
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
    }, [registerGuide, setPageTitle]);



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
            factory_id: selectedFactory || (factories.length === 1 ? factories[0].id : ''),
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
            factory_id: machine.factory_id || '',
        });
        setModalOpen(true);
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();

        const payload = {
            ...formData,
            max_die_weight: formData.max_die_weight ? Number(formData.max_die_weight) : null,
            daily_running_cost: Number(formData.daily_running_cost),
        };

        saveMutation.mutate(payload);
    };

    // Handle delete
    const handleDelete = async (machine) => {
        if (!confirm(`Delete machine "${machine.name}"?`)) return;
        deleteMutation.mutate(machine.id);
    };

    // Toggle status
    const handleToggleStatus = async (machine) => {
        statusMutation.mutate({
            id: machine.id,
            status: machine.status === 'active' ? 'inactive' : 'active',
        });
    };

    // Calculate stats
    const totalMachines = machines.length;
    const activeMachines = machines.filter((m) => m.status === 'active').length;
    const totalDailyCost = machines.reduce((sum, m) => sum + (m.daily_running_cost || 0), 0);

    return (
        <>
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
                        <button className={styles.retryButton} onClick={() => refetch()}>
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
                                    <th>Factory</th>
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
                                        <td className="text-muted text-sm">{machine.factories?.name || '—'}</td>
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
                                    <label className={styles.formLabel}>Factory *</label>
                                    <FactorySelect
                                        value={formData.factory_id}
                                        onChange={(val) => setFormData({ ...formData, factory_id: val })}
                                        disabled={!!editingMachine}
                                    />
                                </div>

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
                                        <CustomSelect
                                            options={MACHINE_TYPES}
                                            value={formData.type}
                                            onChange={(val) => setFormData({ ...formData, type: val })}
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Category *</label>
                                        <CustomSelect
                                            options={MACHINE_CATEGORIES}
                                            value={formData.category}
                                            onChange={(val) => setFormData({ ...formData, category: val })}
                                        />
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
                                    <CustomSelect
                                        options={[
                                            { value: 'active', label: 'Active' },
                                            { value: 'inactive', label: 'Inactive' }
                                        ]}
                                        value={formData.status}
                                        onChange={(val) => setFormData({ ...formData, status: val })}
                                    />
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
        </>
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
