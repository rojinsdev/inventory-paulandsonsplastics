'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Loader2, Users, Phone, MapPin, Eye } from 'lucide-react';
import { customersAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatDate, cn } from '@/lib/utils';
import { useUI } from '@/contexts/UIContext';
import styles from './page.module.css';

export default function CustomersPage() {
    const queryClient = useQueryClient();
    const router = useRouter();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        address: '',
        gstin: '',
        notes: '',
    });
    const [viewingId, setViewingId] = useState(null);

    // Queries
    const { data: customers = [], isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['customers'],
        queryFn: () => customersAPI.getAll(),
    });

    const error = queryError?.message;

    // Mutations
    const saveMutation = useMutation({
        mutationFn: (data) => editingCustomer
            ? customersAPI.update(editingCustomer.id, data)
            : customersAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setModalOpen(false);
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => customersAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const saving = saveMutation.isPending;


    useEffect(() => {
        setPageTitle('Customers');
        registerGuide({
            title: "Customer Management",
            description: "Centralized directory for all B2B clients and wholesale buyers.",
            logic: [
                {
                    title: "B2B Billing Context",
                    explanation: "Customer profiles are required for all Sales Orders. The system uses these records to auto-populate tax and shipping details."
                },
                {
                    title: "GST Integration",
                    explanation: "Valid GST numbers are essential for generating tax invoices. Profiles with missing GST will be flagged during the order process."
                }
            ],
            components: [
                {
                    name: "Contact Cards",
                    description: "Provides one-click access to phone and map location for transport coordination."
                },
                {
                    name: "Notes Section",
                    description: "Internal ledger for tracking customer-specific pricing or delivery preferences."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);



    const handleCreate = () => {
        setEditingCustomer(null);
        setFormData({
            name: '',
            phone: '',
            email: '',
            address: '',
            gstin: '',
            notes: '',
        });
        setModalOpen(true);
    };

    const handleEdit = (customer) => {
        setEditingCustomer(customer);
        setFormData({
            name: customer.name || '',
            phone: customer.phone || '',
            email: customer.email || '',
            address: customer.address || '',
            gstin: customer.gstin || '',
            notes: customer.notes || '',
        });
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    const handleDelete = async (customer) => {
        if (!confirm(`Delete customer "${customer.name}"?`)) return;
        deleteMutation.mutate(customer.id);
    };

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Customers</h1>
                    <p className={styles.pageDescription}>
                        Manage customer records and contact information
                    </p>
                </div>
                <button className={styles.addButton} onClick={handleCreate}>
                    <Plus size={18} />
                    <span>Add Customer</span>
                </button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Users size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{customers.length}</div>
                        <div className={styles.statLabel}>Total Customers</div>
                        <div className={styles.statSublabel}>Active records</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading customers...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>Error: {error}</p>
                        <button className="btn btn-secondary" onClick={() => refetch()}>
                            Retry
                        </button>
                    </div>
                ) : customers.length === 0 ? (
                    <div className="empty-state">
                        <Users size={48} />
                        <p>No customers yet</p>
                        <button className="btn btn-primary" onClick={handleCreate}>
                            Add First Customer
                        </button>
                    </div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Address</th>
                                <th>GST</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map((customer) => (
                                <tr key={customer.id}>
                                    <td className="font-medium">{customer.name}</td>
                                    <td>
                                        {customer.phone ? (
                                            <span className={styles.phoneCell}>
                                                <Phone size={14} />
                                                {customer.phone}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td className="text-muted">{customer.email || '—'}</td>
                                    <td>
                                        {customer.address ? (
                                            <span className={styles.addressCell} title={customer.address}>
                                                <MapPin size={14} />
                                                {customer.address.substring(0, 30)}
                                                {customer.address.length > 30 && '...'}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td className="text-muted">{customer.gstin || '—'}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => {
                                                    setViewingId(customer.id);
                                                    router.push(`/customers/${customer.id}`);
                                                }}
                                                disabled={viewingId === customer.id}
                                                title="View Profile"
                                            >
                                                {viewingId === customer.id ? (
                                                    <Loader2 size={14} className={styles.spinner} />
                                                ) : (
                                                    <Eye size={14} />
                                                )}
                                            </button>
                                            <button
                                                className="btn btn-sm btn-outline"
                                                onClick={() => handleEdit(customer)}
                                                title="Edit"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                className="btn btn-sm btn-outline"
                                                onClick={() => handleDelete(customer)}
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
                            <h2>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                ×
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
                                        placeholder="Customer name"
                                    />
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Phone</label>
                                        <input
                                            type="tel"
                                            className={styles.formInput}
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            placeholder="+91 XXXXX XXXXX"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Email</label>
                                        <input
                                            type="email"
                                            className={styles.formInput}
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            placeholder="customer@email.com"
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Address</label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        rows={2}
                                        placeholder="Full address"
                                    />
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>GST Number</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={formData.gstin}
                                            onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                                            placeholder="GSTIN"
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Notes</label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        rows={2}
                                        placeholder="Internal notes about this customer"
                                    />
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
                                    ) : editingCustomer ? (
                                        'Update Customer'
                                    ) : (
                                        'Create Customer'
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
