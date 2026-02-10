'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    X,
    Plus,
    Trash2,
    Edit2,
    Save,
    RefreshCw,
    ArrowUpCircle,
    ArrowDownCircle,
    Settings,
    Tag
} from 'lucide-react';
import { cashFlowAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

export default function CategoryManager({ onClose }) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('expense');
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({ name: '', default_amount: '', is_shared: false });

    // Form for new category
    const [newCat, setNewCat] = useState({ name: '', default_amount: '', is_shared: false });

    const { data: categories, isLoading } = useQuery({
        queryKey: ['cash-flow-categories'],
        queryFn: () => cashFlowAPI.getCategories()
    });

    const filteredCategories = categories?.filter(c => c.type === activeTab) || [];

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newCat.name) return;
        setLoading(true);
        try {
            await cashFlowAPI.createCategory({
                name: newCat.name,
                type: activeTab,
                default_amount: Number(newCat.default_amount) || 0,
                is_shared: newCat.is_shared
            });
            setNewCat({ name: '', default_amount: '', is_shared: false });
            queryClient.invalidateQueries(['cash-flow-categories']);
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this category? Past logs will remain but the category label will be lost.')) return;
        try {
            await cashFlowAPI.deleteCategory(id);
            queryClient.invalidateQueries(['cash-flow-categories']);
        } catch (error) {
            alert(error.message);
        }
    };

    const handleUpdate = async (id) => {
        try {
            await cashFlowAPI.updateCategory(id, {
                name: editData.name,
                default_amount: Number(editData.default_amount) || 0,
                is_shared: editData.is_shared
            });
            setEditingId(null);
            queryClient.invalidateQueries(['cash-flow-categories']);
        } catch (error) {
            alert(error.message);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={cn(styles.modal, styles.managerModal)}>
                <div className={styles.modalHeader}>
                    <div className={styles.modalTitleIcon}>
                        <Settings className="text-primary" />
                        <h2 className={styles.modalTitle}>Category Manager</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
                </div>

                <div className={styles.typeTabs}>
                    <button
                        className={cn(styles.tab, activeTab === 'income' && styles.active)}
                        onClick={() => setActiveTab('income')}
                    >
                        <ArrowUpCircle size={16} />
                        Inflow
                    </button>
                    <button
                        className={cn(styles.tab, activeTab === 'expense' && styles.active)}
                        onClick={() => setActiveTab('expense')}
                    >
                        <ArrowDownCircle size={16} />
                        Expense
                    </button>
                </div>

                <form onSubmit={handleAdd} className={styles.categoryFormInline}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Category Name</label>
                        <input
                            className={styles.input}
                            placeholder="e.g. Electricity Bill"
                            value={newCat.name}
                            onChange={e => setNewCat({ ...newCat, name: e.target.value })}
                            required
                        />
                    </div>
                    <div className={styles.formGroup} style={{ maxWidth: '140px' }}>
                        <label className={styles.label}>Shared Cost?</label>
                        <div className={styles.checkboxWrapper}>
                            <input
                                type="checkbox"
                                checked={newCat.is_shared}
                                onChange={e => setNewCat({ ...newCat, is_shared: e.target.checked })}
                                className={styles.checkbox}
                            />
                            <span className={styles.checkboxLabel}>Split</span>
                        </div>
                    </div>
                    <button type="submit" className={styles.addCatBtn} disabled={loading}>
                        {loading ? <RefreshCw className={styles.spin} size={16} /> : <Plus size={20} />}
                    </button>
                </form>

                <div className={styles.categoryList}>
                    {isLoading ? (
                        <div className="flex justify-center p-8"><RefreshCw className={styles.spin} /></div>
                    ) : filteredCategories.length === 0 ? (
                        <div className={styles.emptyState}>No {activeTab} categories yet</div>
                    ) : (
                        filteredCategories.map(cat => (
                            <div key={cat.id} className={styles.categoryItem}>
                                {editingId === cat.id ? (
                                    <div className={styles.editingCard}>
                                        <div className={styles.editGroup}>
                                            <label className={styles.editLabel}>Update Name</label>
                                            <input
                                                className={styles.editInput}
                                                value={editData.name}
                                                onChange={e => setEditData({ ...editData, name: e.target.value })}
                                                autoFocus
                                            />
                                        </div>

                                        <div className={styles.editGroup}>
                                            <label className={styles.editLabel}>Price</label>
                                            <input
                                                type="number"
                                                className={cn(styles.editInput, styles.priceInput)}
                                                value={editData.default_amount}
                                                onChange={e => setEditData({ ...editData, default_amount: e.target.value })}
                                            />
                                        </div>

                                        <div className={styles.editGroup}>
                                            <label className={styles.editLabel}>Shared Cost</label>
                                            <div className={styles.checkboxWrapper}>
                                                <input
                                                    type="checkbox"
                                                    checked={editData.is_shared}
                                                    onChange={e => setEditData({ ...editData, is_shared: e.target.checked })}
                                                    className={styles.checkbox}
                                                />
                                                <span className={styles.checkboxLabel}>Split across all factories</span>
                                            </div>
                                        </div>

                                        <div className={styles.editActions}>
                                            <button className={styles.cancelAction} onClick={() => setEditingId(null)} title="Cancel">
                                                Cancel
                                            </button>
                                            <button className={styles.saveAction} onClick={() => handleUpdate(cat.id)} title="Save Changes">
                                                <Save size={18} />
                                                <span>Save Changes</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className={styles.catMainInfo}>
                                            <div className="flex items-center gap-2">
                                                <div className={styles.catName}>{cat.name}</div>
                                                {cat.is_system ? (
                                                    <span className={styles.systemBadge}>System</span>
                                                ) : (
                                                    <span className={styles.customBadge}>Custom</span>
                                                )}
                                                {cat.is_shared && (
                                                    <span className={styles.sharedBadge}>Shared</span>
                                                )}
                                            </div>
                                            <div className={styles.catMeta}>
                                                Default Suggestion: <span className="text-main font-semibold">{cat.default_amount ? `₹${cat.default_amount}` : 'None'}</span>
                                            </div>
                                        </div>
                                        <div className={styles.catActions}>
                                            <button className={styles.catActionBtn} onClick={() => {
                                                setEditingId(cat.id);
                                                setEditData({
                                                    name: cat.name,
                                                    default_amount: cat.default_amount || '',
                                                    is_shared: cat.is_shared || false
                                                });
                                            }}>
                                                <Edit2 size={14} />
                                            </button>
                                            {!cat.is_system && (
                                                <button className={cn(styles.catActionBtn, styles.deleteBtn)} onClick={() => handleDelete(cat.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className={styles.modalActions}>
                    <button onClick={onClose} className={styles.cancelLink}>Done</button>
                </div>
            </div>
        </div>
    );
}
