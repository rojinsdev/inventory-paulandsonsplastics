'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    X,
    Plus,
    Trash2,
    RefreshCw,
    Pencil,
    Tag
} from 'lucide-react';
import { cashFlowAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

export default function CategoryManager({ onClose }) {
    const queryClient = useQueryClient();
    const [context, setContext] = useState('expense');
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    
    const [formData, setFormData] = useState({ name: '', default_amount: '', is_shared: false });

    const { data: categories, isLoading } = useQuery({
        queryKey: ['cash-flow-categories'],
        queryFn: () => cashFlowAPI.getCategories()
    });

    const filteredCategories = categories?.filter(c => c.type === context) || [];

    const resetForm = (cat = null) => {
        if (cat) {
            setFormData({
                name: cat.name,
                default_amount: cat.default_amount || '',
                is_shared: cat.is_shared || false
            });
        } else {
            setFormData({ name: '', default_amount: '', is_shared: false });
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.name) return;
        setLoading(true);
        try {
            if (editingId) {
                await cashFlowAPI.updateCategory(editingId, {
                    name: formData.name,
                    default_amount: Number(formData.default_amount) || 0,
                    is_shared: formData.is_shared
                });
            } else {
                await cashFlowAPI.createCategory({
                    name: formData.name,
                    type: context,
                    default_amount: Number(formData.default_amount) || 0,
                    is_shared: formData.is_shared
                });
            }
            setEditingId(null);
            resetForm();
            queryClient.invalidateQueries({ queryKey: ['cash-flow-categories'] });
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this category? Past logs will remain.')) return;
        setLoading(true);
        try {
            await cashFlowAPI.deleteCategory(id);
            if (editingId === id) {
                setEditingId(null);
                resetForm();
            }
            queryClient.invalidateQueries({ queryKey: ['cash-flow-categories'] });
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={cn(styles.modal, styles.categoryManagerModal)} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <div className={styles.modalTitleIcon}>
                        <Tag color="var(--primary)" />
                        <h2 className={styles.modalTitle}>Category Manager</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSave} className={cn(styles.form, styles.categoryManagerForm)}>
                    {/* Type toggle */}
                    <div className={styles.formGrid}>
                        <button
                            type="button"
                            className={cn(styles.segmentBtn, context === 'income' && styles.segmentBtnActive)}
                            onClick={() => { setContext('income'); setEditingId(null); resetForm(); }}
                        >
                            Inflow Categories
                        </button>
                        <button
                            type="button"
                            className={cn(styles.segmentBtn, context === 'expense' && styles.segmentBtnActive)}
                            onClick={() => { setContext('expense'); setEditingId(null); resetForm(); }}
                        >
                            Expense Categories
                        </button>
                    </div>

                    {/* Create / Edit */}
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Category Name</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder={context === 'income' ? 'e.g., Sales Receipt' : 'e.g., Raw Material'}
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>

                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Default Amount (₹)</label>
                            <input
                                type="number"
                                className={styles.input}
                                placeholder="0.00"
                                value={formData.default_amount}
                                onChange={e => setFormData({ ...formData, default_amount: e.target.value })}
                                step="0.01"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Allocation</label>
                            <div className={cn(styles.splitToggle, formData.is_shared && styles.splitToggleActive)}>
                                <label className={styles.splitLabel}>
                                    <input
                                        type="checkbox"
                                        checked={formData.is_shared}
                                        onChange={e => setFormData({ ...formData, is_shared: e.target.checked })}
                                    />
                                    <span>Shared (Auto-split)</span>
                                </label>
                                <div className={styles.splitHint}>Applies across all factory units automatically.</div>
                            </div>
                        </div>
                    </div>

                    {/* List */}
                    <div className={styles.categoryManagerSection}>
                        <div className={styles.categoryManagerSectionHeader}>
                            <div className={styles.categoryManagerSectionTitle}>
                                {context === 'income' ? 'Inflow' : 'Expense'} Categories
                            </div>
                            <div className={styles.categoryManagerSectionMeta}>
                                {filteredCategories.length} total
                            </div>
                        </div>

                        {isLoading ? (
                            <div className={styles.categoryManagerEmpty}>
                                <RefreshCw size={18} className={styles.spin} />
                                <span>Loading categories…</span>
                            </div>
                        ) : filteredCategories.length === 0 ? (
                            <div className={styles.categoryManagerEmpty}>
                                <span>No categories yet</span>
                            </div>
                        ) : (
                            <div className={styles.categoryManagerList}>
                                {filteredCategories.map(cat => (
                                    <div
                                        key={cat.id}
                                        className={cn(styles.categoryManagerRow, editingId === cat.id && styles.categoryManagerRowActive)}
                                    >
                                        <div className={styles.categoryManagerRowMain}>
                                            <div className={styles.categoryManagerRowTitle}>
                                                <span>{cat.name}</span>
                                                {cat.is_shared && <span className={styles.splitBadge}>Split</span>}
                                            </div>
                                            <div className={styles.categoryManagerRowSub}>
                                                ₹{cat.default_amount || '0'}
                                            </div>
                                        </div>

                                        <div className={styles.categoryManagerRowActions}>
                                            <button
                                                type="button"
                                                onClick={() => { setEditingId(cat.id); resetForm(cat); }}
                                                className={styles.actionButton}
                                                title="Edit"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(cat.id)}
                                                className={styles.actionButton}
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className={styles.modalActions}>
                        {editingId ? (
                            <button
                                type="button"
                                onClick={() => { setEditingId(null); resetForm(); }}
                                className={styles.cancelLink}
                            >
                                Cancel Edit
                            </button>
                        ) : (
                            <button type="button" onClick={onClose} className={styles.cancelLink}>
                                Close
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={cn(styles.submitBtn, context === 'income' ? styles.submitIncome : styles.submitExpense)}
                        >
                            {loading ? <RefreshCw className={styles.spin} size={16} /> : (editingId ? <Pencil size={16} /> : <Plus size={16} />)}
                            {loading ? 'Saving…' : (editingId ? 'Update Category' : 'Add Category')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
