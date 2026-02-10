'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2, Factory, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useUI } from '@/contexts/UIContext';
import { useGuide } from '@/contexts/GuideContext';
import { formatDate, cn } from '@/lib/utils';
import styles from './page.module.css';

import { factoriesAPI } from '@/lib/api';

// Legacy inline API removed in favor of global authenticating API defined in lib/api.js

export default function FactoriesPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingFactory, setEditingFactory] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        location: '',
        contact_person: '',
        contact_phone: '',
        contact_email: '',
    });

    // Queries
    const { data: factories = [], isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['factories'],
        queryFn: () => factoriesAPI.getAll(),
    });

    const error = queryError?.message;

    // Mutations
    const saveMutation = useMutation({
        mutationFn: (data) => editingFactory
            ? factoriesAPI.update(editingFactory.id, data)
            : factoriesAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['factories'] });
            setModalOpen(false);
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, active }) => factoriesAPI.toggle(id, active),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['factories'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => factoriesAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['factories'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const saving = saveMutation.isPending;

    useEffect(() => {
        setPageTitle('Factory Management');
        registerGuide({
            title: "Factory Management",
            description: "Configure your manufacturing facilities.",
            logic: [
                {
                    title: "Active Status",
                    explanation: "Only active factories can be selected for production logs. Deactivating a factory preserves its history but prevents new entries."
                }
            ],
            components: [
                {
                    name: "Factory List",
                    description: "Overview of all registered facilities with toggle controls."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);

    const handleCreate = () => {
        setEditingFactory(null);
        setFormData({
            name: '',
            code: '',
            location: '',
            contact_person: '',
            contact_phone: '',
            contact_email: '',
        });
        setModalOpen(true);
    };

    const handleEdit = (factory) => {
        setEditingFactory(factory);
        setFormData({
            name: factory.name,
            code: factory.code,
            location: factory.location || '',
            contact_person: factory.contact_person || '',
            contact_phone: factory.contact_phone || '',
            contact_email: factory.contact_email || '',
        });
        setModalOpen(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    const handleToggle = async (factory) => {
        const action = factory.active ? 'deactivate' : 'activate';
        if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} factory "${factory.name}"?`)) return;
        toggleMutation.mutate({ id: factory.id, active: !factory.active });
    };

    const handleDelete = async (factory) => {
        if (!confirm(`Delete factory "${factory.name}"? This action cannot be undone and will fail if the factory has associated data.`)) return;
        deleteMutation.mutate(factory.id);
    };



    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Factory Management</h1>
                    <p className={styles.pageDescription}>
                        Manage manufacturing facilities and locations
                    </p>
                </div>
                <button className={styles.addButton} onClick={handleCreate}>
                    <Plus size={18} />
                    <span>Add Factory</span>
                </button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Factory size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{factories.length}</div>
                        <div className={styles.statLabel}>Total Factories</div>
                        <div className={styles.statSublabel}>All facilities</div>
                    </div>
                </div>

            </div>

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading factories...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>Error: {error}</p>
                        <button className="btn btn-secondary" onClick={() => refetch()}>
                            Retry
                        </button>
                    </div>
                ) : factories.length === 0 ? (
                    <div className="empty-state">
                        <Factory size={48} />
                        <p>No factories yet</p>
                        <button className="btn btn-primary" onClick={handleCreate}>
                            Add First Factory
                        </button>
                    </div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Location</th>
                                <th>Contact Person</th>
                                <th>Contact Phone</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {factories.map((factory) => (
                                <tr key={factory.id}>
                                    <td className="font-medium">{factory.name}</td>
                                    <td>
                                        <span className={styles.codeTag}>{factory.code}</span>
                                    </td>
                                    <td className="text-muted">{factory.location || '—'}</td>
                                    <td>{factory.contact_person || '—'}</td>
                                    <td className="text-muted">{factory.contact_phone || '—'}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                className="btn btn-sm btn-outline"
                                                onClick={() => handleEdit(factory)}
                                                title="Edit"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                className="btn btn-sm btn-outline"
                                                onClick={() => handleDelete(factory)}
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>{editingFactory ? 'Edit Factory' : 'Add Factory'}</h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Factory Name *</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            placeholder="e.g., Main Factory"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Factory Code *</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={formData.code}
                                            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                            required
                                            placeholder="e.g., MAIN"
                                            maxLength={10}
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Location</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        placeholder="Factory address or city"
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Contact Person</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.contact_person}
                                        onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                                        placeholder="Factory manager name"
                                    />
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Contact Phone</label>
                                        <input
                                            type="tel"
                                            className={styles.formInput}
                                            value={formData.contact_phone}
                                            onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                                            placeholder="+91 XXXXX XXXXX"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Contact Email</label>
                                        <input
                                            type="email"
                                            className={styles.formInput}
                                            value={formData.contact_email}
                                            onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                                            placeholder="factory@email.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={() => setModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className={styles.submitButton} disabled={saving}>
                                    {saving ? (
                                        <>
                                            <Loader2 size={16} className={styles.spinner} />
                                            Saving...
                                        </>
                                    ) : editingFactory ? (
                                        'Update Factory'
                                    ) : (
                                        'Create Factory'
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
