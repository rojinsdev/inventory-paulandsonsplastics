'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import {
    Loader2, Plus, Search, Filter, Trash2, Edit2,
    Check, X, HardHat, Package, Factory,
    Clock, Weight, Info
} from 'lucide-react';
import { capsAPI, productsAPI } from '@/lib/api';
import { formatNumber, cn } from '@/lib/utils';
import { useFactory } from '@/contexts/FactoryContext';
import { useGuide } from '@/contexts/GuideContext';
import FactorySelect from '@/components/ui/FactorySelect';
import toast from 'react-hot-toast';
import styles from './page.module.css';

export default function CapManagementPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCap, setSelectedCap] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        color: '',
        ideal_weight_grams: '',
        ideal_cycle_time_seconds: '',
        factory_id: '',
        product_ids: [] // Mapping
    });

    const [productSearch, setProductSearch] = useState('');

    // Fetch Products for mapping (filtered by the factory selected in the form)
    const { data: formProducts = [], isLoading: loadingFormProducts } = useQuery({
        queryKey: ['products', formData.factory_id],
        queryFn: () => productsAPI.getAll({ factory_id: formData.factory_id }),
        enabled: !!formData.factory_id && isModalOpen,
    });

    const { data: caps = [], isLoading: loadingCaps, error: capsError } = useQuery({
        queryKey: ['caps', selectedFactory],
        queryFn: () => capsAPI.getAll(selectedFactory ? { factory_id: selectedFactory } : {}),
    });

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data) => capsAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['caps']);
            toast.success('Cap created successfully');
            closeModal();
        },
        onError: (err) => toast.error(err.message || 'Failed to create cap')
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => capsAPI.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['caps']);
            toast.success('Cap updated successfully');
            closeModal();
        },
        onError: (err) => toast.error(err.message || 'Failed to update cap')
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => capsAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['caps']);
            toast.success('Cap deleted successfully');
        },
        onError: (err) => toast.error(err.message || 'Failed to delete cap')
    });

    const isSaving = createMutation.isPending || updateMutation.isPending;

    useEffect(() => {
        setPageTitle('Cap Management');
        registerGuide({
            title: 'Cap Management',
            description: 'Define and map bottle caps. Caps are tracked separately for production and stock.',
            logic: [
                {
                    title: 'Weight-Based Production',
                    explanation: 'Cap production is logged by total weight. The system automatically calculates unit counts using the Ideal Weight.'
                },
                {
                    title: 'Product Mapping',
                    explanation: 'Map a cap to multiple products. When these products are packed or bundled, the corresponding cap stock is automatically deducted.'
                },
                {
                    title: 'Ideal Cycle Time',
                    explanation: 'Used for efficiency analytics. Comparing actual cycle time during production against this ideal value helps identify performance losses.'
                }
            ],
            components: [
                { name: 'Cap Inventory', description: 'List of all caps and their mapped products.' },
                { name: 'Mapping Tool', description: 'Associate caps with finished products for automatic deduction.' }
            ]
        });
    }, [registerGuide, setPageTitle]);

    const filteredCaps = useMemo(() => {
        if (!searchQuery) return caps;
        const query = searchQuery.toLowerCase();
        return caps.filter(c =>
            c.name.toLowerCase().includes(query) ||
            (c.color && c.color.toLowerCase().includes(query))
        );
    }, [caps, searchQuery]);

    const openModal = (cap = null) => {
        setProductSearch('');
        if (cap) {
            setSelectedCap(cap);
            setFormData({
                name: cap.name,
                color: cap.color || '',
                ideal_weight_grams: cap.ideal_weight_grams || '',
                ideal_cycle_time_seconds: cap.ideal_cycle_time_seconds || '',
                factory_id: cap.factory_id || '',
                product_ids: cap.mapped_products?.map(p => p.id) || []
            });
        } else {
            setSelectedCap(null);
            setFormData({
                name: '',
                color: '',
                ideal_weight_grams: '',
                ideal_cycle_time_seconds: '',
                factory_id: selectedFactory || (factories.length === 1 ? factories[0].id : ''),
                product_ids: []
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedCap(null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const payload = {
            ...formData,
            ideal_weight_grams: parseFloat(formData.ideal_weight_grams),
            ideal_cycle_time_seconds: parseFloat(formData.ideal_cycle_time_seconds)
        };

        if (selectedCap) {
            updateMutation.mutate({ id: selectedCap.id, data: payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const toggleProductMapping = (productId) => {
        setFormData(prev => {
            const isMapped = prev.product_ids.includes(productId);
            if (isMapped) {
                return { ...prev, product_ids: prev.product_ids.filter(id => id !== productId) };
            } else {
                return { ...prev, product_ids: [...prev.product_ids, productId] };
            }
        });
    };

    const handleDelete = (id, name) => {
        if (window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
            deleteMutation.mutate(id);
        }
    };

    // Stats
    const totalCaps = filteredCaps.length;
    const mappedCount = filteredCaps.filter(c => c.mapped_products?.length > 0).length;

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Cap Management</h1>
                    <p className={styles.pageDescription}>Manage bottle caps, mapping, and production criteria</p>
                </div>
                <button className={styles.primaryButton} onClick={() => openModal()}>
                    <Plus size={18} style={{ marginRight: '8px' }} />
                    New Cap
                </button>
            </div>

            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #4f46e5, #818cf8)' }}>
                        <HardHat size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{totalCaps}</div>
                        <div className={styles.statLabel}>Defined Caps</div>
                        <div className={styles.statSublabel}>Across selected factory</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{mappedCount}</div>
                        <div className={styles.statLabel}>Mapped Caps</div>
                        <div className={styles.statSublabel}>Associated with products</div>
                    </div>
                </div>
            </div>

            <div className={styles.filterBar}>
                <div className={styles.filterRow}>
                    <div className={styles.filterGroup} style={{ flex: 1 }}>
                        <Search size={18} className={styles.filterIcon} />
                        <div className={styles.searchBox}>
                            <input
                                type="text"
                                placeholder="Search caps by name or color..."
                                className={styles.filterInput}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.tableCard}>
                {loadingCaps ? (
                    <div className={styles.loading}>
                        <Loader2 className={styles.spinner} size={32} />
                        <p>Loading cap definitions...</p>
                    </div>
                ) : filteredCaps.length === 0 ? (
                    <div className={styles.emptyState}>
                        <HardHat size={48} />
                        <p>{searchQuery ? 'No caps match your search.' : 'No caps defined yet.'}</p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Cap Name</th>
                                    <th>Color</th>
                                    <th>Ideal Weight</th>
                                    <th>Cycle Time</th>
                                    <th>Mapped Products</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCaps.map(cap => (
                                    <tr key={cap.id}>
                                        <td>
                                            <span className={styles.nameCell}>{cap.name}</span>
                                            {cap.factory_id && (
                                                <span className={styles.mappingInfo}>
                                                    <Factory size={10} style={{ marginRight: '4px' }} />
                                                    {factories.find(f => f.id === cap.factory_id)?.name || 'N/A'}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={cn(styles.badge, styles.badgeGray)}>
                                                {cap.color || 'Default'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Weight size={14} className={styles.textMuted} />
                                                {cap.ideal_weight_grams}g
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={14} className={styles.textMuted} />
                                                {cap.ideal_cycle_time_seconds}s
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '300px' }}>
                                                {cap.mapped_products?.length > 0 ? (
                                                    cap.mapped_products.map(p => (
                                                        <span key={p.id} className={styles.badge} style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                                            {p.name}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className={styles.textMuted} style={{ fontSize: '0.75rem' }}>No mappings</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button className={styles.actionButton} onClick={() => openModal(cap)}>
                                                    <Edit2 size={16} />
                                                </button>
                                                <button className={cn(styles.actionButton)} style={{ color: 'var(--error-text)' }} onClick={() => handleDelete(cap.id, cap.name)}>
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

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className={styles.modalBackdrop} onClick={closeModal}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{selectedCap ? 'Edit Cap Details' : 'Define New Cap'}</h2>
                            <button className={styles.closeBtn} onClick={closeModal}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGrid}>
                                    {/* Left Column: Basic Details */}
                                    <div className={styles.formColumn}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Cap Name *</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                placeholder="e.g. 28mm PCO Cap (Small)"
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                required
                                            />
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Color</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                placeholder="e.g. Blue"
                                                value={formData.color}
                                                onChange={e => setFormData({ ...formData, color: e.target.value })}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Ideal Weight (g) *</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className={styles.formInput}
                                                    value={formData.ideal_weight_grams}
                                                    onChange={e => setFormData({ ...formData, ideal_weight_grams: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Cycle Time (s) *</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    className={styles.formInput}
                                                    value={formData.ideal_cycle_time_seconds}
                                                    onChange={e => setFormData({ ...formData, ideal_cycle_time_seconds: e.target.value })}
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className={styles.mappingInfo} style={{ marginTop: '1rem', padding: '1rem', background: 'var(--slate-50)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                <Info size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                                                Define the physical properties of the cap. These are used to calculate production quantities from total weight.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Right Column: Factory & Product Mapping */}
                                    <div className={styles.formColumn}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Select Factory *</label>
                                            <FactorySelect
                                                value={formData.factory_id}
                                                onChange={val => setFormData({ ...formData, factory_id: val, product_ids: [] })}
                                                disabled={!!selectedCap} // Lock factory on edit
                                            />
                                            {selectedCap && (
                                                <p className={styles.mappingInfo} style={{ marginTop: '0.25rem', color: 'var(--orange-600)' }}>
                                                    Factory cannot be changed after creation.
                                                </p>
                                            )}
                                        </div>

                                        {formData.factory_id ? (
                                            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                                                <label className={styles.formLabel}>Map to Products</label>
                                                <div style={{ marginBottom: '0.75rem' }}>
                                                    <input
                                                        type="text"
                                                        className={styles.formInput}
                                                        placeholder="Search products..."
                                                        value={productSearch}
                                                        onChange={e => setProductSearch(e.target.value)}
                                                    />
                                                </div>
                                                <div className={styles.productList} style={{ maxHeight: '240px' }}>
                                                    {loadingFormProducts ? (
                                                        <div style={{ padding: '1rem', textAlign: 'center' }}>
                                                            <Loader2 className={styles.spinner} size={16} />
                                                        </div>
                                                    ) : (formProducts || []).length === 0 ? (
                                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                            No products found for this factory.
                                                        </div>
                                                    ) : (
                                                        formProducts
                                                            .filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))
                                                            .map(product => {
                                                                const isSelected = formData.product_ids.includes(product.id);
                                                                return (
                                                                    <div
                                                                        key={product.id}
                                                                        className={cn(styles.productItem, isSelected && styles.selected)}
                                                                        onClick={() => toggleProductMapping(product.id)}
                                                                    >
                                                                        <div className={cn(styles.checkbox, isSelected && styles.checked)}>
                                                                            {isSelected && <Check size={12} />}
                                                                        </div>
                                                                        <div className={styles.productInfo}>
                                                                            <span className={styles.productName}>{product.name}</span>
                                                                            <span className={styles.productFactory}>{product.size} {product.color}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={styles.emptyState} style={{ height: '315px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--slate-50)', border: '1px dashed var(--border)', borderRadius: '0.75rem' }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <Factory size={32} style={{ marginBottom: '1rem', opacity: 0.3, color: 'var(--text-main)' }} />
                                                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>Factory required</p>
                                                    <p style={{ margin: '0.5rem 1rem 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        Product mappings are restricted by factory location.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.modalFooter} style={{ marginTop: '2rem' }}>
                                    <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        onClick={closeModal}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className={styles.submitButton}
                                        disabled={isSaving || !formData.factory_id}
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className={styles.spinner} size={16} />
                                                Saving...
                                            </>
                                        ) : (
                                            selectedCap ? 'Save Changes' : 'Create Cap'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
