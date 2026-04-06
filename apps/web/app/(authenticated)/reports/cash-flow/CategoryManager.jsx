'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    X,
    Plus,
    Trash2,
    Save,
    RefreshCw,
    Settings,
    ChevronRight,
    Search
} from 'lucide-react';
import { cashFlowAPI } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import styles from './page.module.css';

export default function CategoryManager({ onClose }) {
    const queryClient = useQueryClient();
    const [context, setContext] = useState('expense');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [formData, setFormData] = useState({ name: '', default_amount: '', is_shared: false });

    const { data: categories, isLoading } = useQuery({
        queryKey: ['cash-flow-categories'],
        queryFn: () => cashFlowAPI.getCategories()
    });

    const filteredCategories = categories?.filter(c => 
        c.type === context && 
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const handleSelect = (cat) => {
        if (cat) {
            setSelectedId(cat.id);
            setFormData({
                name: cat.name,
                default_amount: cat.default_amount || '',
                is_shared: cat.is_shared || false
            });
        } else {
            setSelectedId('new');
            setFormData({ name: '', default_amount: '', is_shared: false });
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.name) return;
        setLoading(true);
        try {
            if (selectedId && selectedId !== 'new') {
                await cashFlowAPI.updateCategory(selectedId, {
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
            setSelectedId(null);
            queryClient.invalidateQueries(['cash-flow-categories']);
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedId || selectedId === 'new') return;
        if (!confirm('Are you sure? Past logs will remain but the category label will be lost.')) return;
        setLoading(true);
        try {
            await cashFlowAPI.deleteCategory(selectedId);
            setSelectedId(null);
            queryClient.invalidateQueries(['cash-flow-categories']);
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={cn(styles.modal, styles.modalLandscape, styles.managerModalRefined)}>
                <div className={styles.modalHeader}>
                    <div className={styles.modalTitleIcon}>
                        <Settings color="var(--primary)" />
                        <h2 className={styles.modalTitle}>Category Management</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
                </div>

                <div className={styles.modalColumns}>
                    {/* Left: Category List */}
                    <div className={styles.categoryNav}>
                        <div className={styles.navControls}>
                            <div className={styles.periodToggle}>
                                <button 
                                    className={cn(styles.periodBtn, context === 'income' && styles.active)}
                                    onClick={() => { setContext('income'); setSelectedId(null); }}
                                >
                                    Inflow
                                </button>
                                <button 
                                    className={cn(styles.periodBtn, context === 'expense' && styles.active)}
                                    onClick={() => { setContext('expense'); setSelectedId(null); }}
                                >
                                    Expense
                                </button>
                            </div>
                            <div className={styles.searchWrapper}>
                                <Search size={14} className={styles.searchIcon} />
                                <input 
                                    className={styles.searchInput}
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className={styles.categoryItemsList}>
                            <button 
                                className={cn(styles.newItemBtn, selectedId === 'new' && styles.activeItem)}
                                onClick={() => handleSelect(null)}
                            >
                                <Plus size={16} />
                                <span>Create New Category</span>
                            </button>

                            {isLoading ? (
                                <div className={styles.loadingCenter}><RefreshCw className={styles.spin} /></div>
                            ) : filteredCategories.map(cat => (
                                <div 
                                    key={cat.id}
                                    className={cn(styles.categoryListItem, selectedId === cat.id && styles.activeItem)}
                                    onClick={() => handleSelect(cat)}
                                >
                                    <div className={styles.catInfo}>
                                        <span className={styles.catNameText}>{cat.name}</span>
                                        <span className={styles.catAmountText}>Def: {formatCurrency(cat.default_amount || 0)}</span>
                                    </div>
                                    <ChevronRight size={14} className={styles.chevron} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Editor */}
                    <div className={styles.editorPane}>
                        {!selectedId ? (
                            <div className={styles.emptyEditor}>
                                <Settings size={48} strokeWidth={1} />
                                <p>Select a category to modify its properties or create a new one.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSave} className={styles.form}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Category Name</label>
                                    <input 
                                        className={styles.input}
                                        placeholder="e.g. Electricity Bill"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Default Amount</label>
                                        <div className={styles.currencyWrapper}>
                                            <span className={styles.currencyPrefix}>₹</span>
                                            <input 
                                                type="number"
                                                className={cn(styles.input, styles.currencyInput)}
                                                placeholder="0.00"
                                                value={formData.default_amount}
                                                onChange={e => setFormData({ ...formData, default_amount: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div 
                                        className={cn(styles.checkboxCard, formData.is_shared && styles.checked)}
                                        onClick={() => setFormData({ ...formData, is_shared: !formData.is_shared })}
                                    >
                                        <div className={styles.checkboxGroup}>
                                            <div className={cn(styles.customCheckbox, formData.is_shared && styles.checked)}>
                                                {formData.is_shared && <div className={styles.checkMark} />}
                                            </div>
                                            <div className={styles.checkboxInfo}>
                                                <span className={styles.checkTitle}>Shared Category</span>
                                                <span className={styles.checkDesc}>Split across all factories</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.editorActions}>
                                    {selectedId && selectedId !== 'new' && (
                                        <button 
                                            type="button" 
                                            className={styles.deleteLink}
                                            onClick={handleDelete}
                                            disabled={loading}
                                        >
                                            <Trash2 size={16} />
                                            <span>Delete</span>
                                        </button>
                                    )}
                                    
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
                                        <button 
                                            type="button"
                                            className={styles.cancelLink}
                                            onClick={() => setSelectedId(null)}
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            type="submit" 
                                            className={cn(styles.actionBtn, styles.submitBtn, context === 'income' ? styles.submitIncome : styles.submitExpense)}
                                            disabled={loading}
                                        >
                                            {loading ? <RefreshCw className={styles.spin} size={18} /> : <Save size={18} />}
                                            <span>Save Category</span>
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
