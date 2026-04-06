'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Plus, 
    Pencil, 
    Trash2, 
    Loader2, 
    Search,
    Phone,
    Mail,
    MapPin,
    CreditCard,
    MoreVertical,
    Eye
} from 'lucide-react';
import Link from 'next/link';
import { suppliersAPI } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import styles from '../CompanyDealings.module.css';

export default function SuppliersTab({ suppliers = [], isLoading }) {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        gstin: '',
        notes: '',
    });


    const saveMutation = useMutation({
        mutationFn: (data) => editingSupplier 
            ? suppliersAPI.update(editingSupplier.id, data)
            : suppliersAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            setModalOpen(false);
        },
        onError: (err) => alert(err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => suppliersAPI.delete(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        onError: (err) => alert(err.message)
    });

    const handleCreate = () => {
        setEditingSupplier(null);
        setFormData({
            name: '',
            contact_person: '',
            phone: '',
            email: '',
            address: '',
            gstin: '',
            notes: '',
        });
        setModalOpen(true);
    };

    const handleEdit = (supplier) => {
        setEditingSupplier(supplier);
        setFormData({
            name: supplier.name || '',
            contact_person: supplier.contact_person || '',
            phone: supplier.phone || '',
            email: supplier.email || '',
            address: supplier.address || '',
            gstin: supplier.gstin || '',
            notes: supplier.notes || '',
        });
        setModalOpen(true);
    };

    const handleDelete = (id, name) => {
        if (confirm(`Are you sure you want to delete supplier "${name}"?`)) {
            deleteMutation.mutate(id);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    const filteredSuppliers = suppliers.filter(s => 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.gstin && s.gstin.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (isLoading) return <div className={cn(styles.flex, styles.itemsCenter, styles.justifyCenter, styles.p12)}><Loader2 className={cn(styles.animateSpin, styles.textPrimary)} /></div>;

    return (
        <div className={styles.tabContentInner}>
            <div className={styles.tableWrapper}>
                <div className={styles.filterContainer}>
                    <div className={styles.filterRow}>
                        <div className={styles.searchBox}>
                            <Search className={styles.filterIcon} size={20} />
                            <input
                                type="text"
                                placeholder="Search suppliers by name or GSTIN..."
                                className={cn("input", styles.filterInput)}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <button 
                        className="btn btn-primary"
                        onClick={handleCreate}
                    >
                        <Plus size={18} />
                        <span>Add Supplier</span>
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Supplier Name</th>
                                <th>Contact Person</th>
                                <th>Contact Info</th>
                                <th>GSTIN</th>
                                <th style={{ textAlign: 'right' }}>Credit Balance</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSuppliers.map((supplier) => (
                                <tr key={supplier.id}>
                                    <td>
                                        <div className={cn(styles.fontSemibold, styles.textMain)}>{supplier.name}</div>
                                        {supplier.notes && <div className={cn(styles.textXs, styles.textMuted, styles.truncate, styles.maxWXxs)}>{supplier.notes}</div>}
                                    </td>
                                    <td>{supplier.contact_person || '—'}</td>
                                    <td>
                                        <div className={cn(styles.flexCol, styles.gap1, styles.textXs)}>
                                            {supplier.phone && <span className={cn(styles.flex, styles.itemsCenter, styles.gap1_5)}><Phone size={12} className={styles.textMuted} /> {supplier.phone}</span>}
                                            {supplier.email && <span className={cn(styles.flex, styles.itemsCenter, styles.gap1_5)}><Mail size={12} className={styles.textMuted} /> {supplier.email}</span>}
                                        </div>
                                    </td>
                                    <td className={cn(styles.fontMono, styles.textXs)}>{supplier.gstin || '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <span className={cn(
                                            "badge", 
                                            Number(supplier.balance_due) > 0 ? styles.debtBadge : styles.creditBadge,
                                            styles.amount
                                        )}>
                                            {formatCurrency(supplier.balance_due)}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className={cn(styles.flex, styles.justifyEnd, styles.gap2)}>
                                            <Link href={`/company-dealings/suppliers/${supplier.id}`} className="btn btn-outline" title="View Profile">
                                                <Eye size={14} />
                                            </Link>
                                            <button className="btn btn-outline" onClick={() => handleEdit(supplier)} title="Edit">
                                                <Pencil size={14} />
                                            </button>
                                            <button className={cn("btn btn-outline", styles.hoverError)} onClick={() => handleDelete(supplier.id, supplier.name)} title="Delete">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredSuppliers.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="empty-state">
                                        <Search size={40} className={styles.mb2} />
                                        <p>No suppliers found matching your search.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Supplier Modal */}
            {modalOpen && (
                <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="h4">{editingSupplier ? 'Edit Supplier Details' : 'Register New Supplier'}</h2>
                            <button onClick={() => setModalOpen(false)} className="btn btn-outline">×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={cn("modal-body", styles.spaceY4)}>
                                <div className="form-group">
                                    <label className="form-label">Company Name *</label>
                                    <input
                                        type="text"
                                        required
                                        className="input"
                                        placeholder="e.g. Acme Plastics Corp"
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    />
                                </div>
                                <div className={cn(styles.grid, styles.gridCols2, styles.gap4)}>
                                    <div className="form-group">
                                        <label className="form-label">Contact Person</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="Full Name"
                                            value={formData.contact_person}
                                            onChange={(e) => setFormData({...formData, contact_person: e.target.value})}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Phone Number</label>
                                        <input
                                            type="tel"
                                            className="input"
                                            placeholder="+91..."
                                            value={formData.phone}
                                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email Address</label>
                                    <input
                                        type="email"
                                        className="input"
                                        placeholder="supplier@example.com"
                                        value={formData.email}
                                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">GSTIN / Tax ID</label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="27AAAAA0000A1Z5"
                                        value={formData.gstin}
                                        onChange={(e) => setFormData({...formData, gstin: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Business Address</label>
                                    <textarea
                                        className="textarea"
                                        rows="3"
                                        placeholder="Complete address..."
                                        value={formData.address}
                                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                                    ></textarea>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Internal Notes</label>
                                    <textarea
                                        className="textarea"
                                        rows="2"
                                        placeholder="Any specific delivery terms or notes..."
                                        value={formData.notes}
                                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                    ></textarea>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saveMutation.isPending}
                                    className="btn btn-primary"
                                >
                                    {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                                    {editingSupplier ? 'Save Changes' : 'Create Supplier'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
