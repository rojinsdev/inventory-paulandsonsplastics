'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Loader2, Plus, Minus, History, Boxes, AlertTriangle, Search, Filter, Wallet, CreditCard, Info } from 'lucide-react';
import { inventoryAPI } from '@/lib/api';
import { formatNumber, formatCurrency, formatDate, cn, getLocalDateISO } from '@/lib/utils';
import { useFactory } from '@/contexts/FactoryContext';
import { useGuide } from '@/contexts/GuideContext';
import FactorySelect from '@/components/ui/FactorySelect';
import CustomSelect from '@/components/ui/CustomSelect';
import toast from 'react-hot-toast'; // Changed to react-hot-toast
import styles from './page.module.css';

export default function RawMaterialsPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    const [adjustmentData, setAdjustmentData] = useState({
        quantity: '',
        unit: 'bags',
        rate: ''
    });
    const [adjustmentReason, setAdjustmentReason] = useState('Purchase');
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [formData, setFormData] = useState({
        name: '',
        stock_weight_kg: 0,
        bag_weight_kg: 25,
        type: 'Granule'
    });
    const [filters, setFilters] = useState({
        search: '',
    });
    const { data: materials = [], isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['raw-materials', selectedFactory],
        queryFn: () => inventoryAPI.getRawMaterials(selectedFactory ? { factory_id: selectedFactory } : {}),
    });

    const error = queryError?.message;

    // Mutations
    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => inventoryAPI.updateRawMaterial(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['raw-materials']);
            setIsEditModalOpen(false);
            toast.success('Material updated successfully');
        },
        onError: (err) => toast.error(err.message || 'Failed to update material')
    });

    const adjustMutation = useMutation({
        mutationFn: ({ id, data }) => inventoryAPI.adjustRawMaterial(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['raw-materials']);
            setIsAdjustModalOpen(false);
            setAdjustmentData({ quantity: '', unit: 'bags', rate: '' });
            toast.success('Stock adjusted successfully');
        },
        onError: (err) => toast.error(err.message || 'Failed to adjust stock')
    });

    const createMutation = useMutation({
        mutationFn: (data) => inventoryAPI.createRawMaterial(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setIsAddModalOpen(false);
            setFormData({ name: '', stock_weight_kg: 0, bag_weight_kg: 25, type: 'Granule' });
            toast.success('Material created successfully');
        },
        onError: (err) => toast.error(err.message || 'Failed to create material')
    });

    const saving = updateMutation.isPending || adjustMutation.isPending || createMutation.isPending;


    useEffect(() => {
        setPageTitle('Raw Materials');
        registerGuide({
            title: 'Raw Materials',
            description: 'Manage procurement and stock levels of plastic granules and recycled materials.',
            logic: [
                {
                    title: 'Material Types',
                    explanation: 'Granules (virgin) and Reprocessed (recycled). Different types have different melting points and yield.'
                },
                {
                    title: 'Stock Thresholds (Min Threshold)',
                    explanation: 'The "Min Threshold" is your safety stock level. If current stock falls below this value, the system marks it as "Low Stock" (red/orange) to signal that you need to reorder materials before production stops.'
                },
                {
                    title: 'Audit Trail',
                    explanation: 'Every stock adjustment (addition or consumption) is logged with a reason for accountability.'
                }
            ],
            components: [
                { name: 'Inventory Grid', description: 'Snapshot of all raw materials and their current stock levels.' },
                { name: 'Adjustment Modal', description: 'Tools to update stock levels manually after purchase or discovery of waste.' },
                { name: 'Low Stock Alerts', description: 'Priority indicators for materials running out.' }
            ]
        });
    }, [registerGuide, setPageTitle]);


    // Filter materials based on search
    const filteredMaterials = useMemo(() => {
        if (!filters.search) return materials;
        const searchLower = filters.search.toLowerCase();
        return materials.filter(m =>
            (m.name || '').toLowerCase().includes(searchLower) ||
            (m.type || '').toLowerCase().includes(searchLower)
        );
    }, [materials, filters.search]);

    const handleAdjust = (material) => {
        setSelectedMaterial(material);
        setAdjustmentData({
            quantity: '',
            unit: 'bags',
            rate: material.last_cost_per_kg || ''
        });
        setIsAdjustModalOpen(true);
        setPaymentMode('Cash');
    };

    const handleEdit = (material) => {
        setSelectedMaterial(material);
        setFormData({
            name: material.name,
            stock_weight_kg: material.stock_weight_kg,
            bag_weight_kg: material.bag_weight_kg || 25,
            type: material.type || 'Granule',
            min_threshold_kg: material.min_threshold_kg || 100
        });
        setIsEditModalOpen(true);
    };

    const handleOpenAddModal = () => {
        setFormData({
            name: '',
            stock_weight_kg: 0,
            bag_weight_kg: 25,
            type: 'Granule',
            factory_id: selectedFactory || (factories.length > 0 ? factories[0].id : null),
            min_threshold_kg: 100
        });
        setIsAddModalOpen(true);
    };

    const handleCreateSubmit = (e) => {
        e.preventDefault();

        // Ensure we have a valid factory_id
        const finalFactoryId = formData.factory_id || selectedFactory || (factories.length > 0 ? factories[0].id : null);

        if (!finalFactoryId) {
            toast.error('Please select a factory');
            return;
        }

        createMutation.mutate({
            ...formData,
            factory_id: finalFactoryId,
            stock_weight_kg: Number(formData.stock_weight_kg) || 0,
            bag_weight_kg: Number(formData.bag_weight_kg) || 25,
            min_threshold_kg: Number(formData.min_threshold_kg) || 100
        });
    };

    const handleEditSubmit = (e) => {
        e.preventDefault();
        updateMutation.mutate({
            id: selectedMaterial.id,
            data: {
                name: formData.name,
                bag_weight_kg: Number(formData.bag_weight_kg),
                type: formData.type,
                min_threshold_kg: Number(formData.min_threshold_kg)
            }
        });
    };

    const handleAdjustSubmit = (e) => {
        e.preventDefault();
        const quantity = parseFloat(adjustmentData.quantity);
        adjustMutation.mutate({
            id: selectedMaterial.id,
            data: {
                quantity: quantity,
                unit: adjustmentData.unit,
                rate_per_kg: parseFloat(adjustmentData.rate),
                reason: adjustmentReason,
                payment_mode: paymentMode,
                date: getLocalDateISO()
            }
        });
    };

    // Calculate totals from filtered materials
    const totalStock = filteredMaterials.reduce((sum, m) => sum + (m.stock_weight_kg || 0), 0);
    const lowStockCount = filteredMaterials.filter((m) => m.stock_weight_kg < (m.min_threshold_kg || 100)).length;
    const materialCount = filteredMaterials.length;

    return (
        <>
            {/* Enhanced Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Raw Materials</h1>
                    <p className={styles.pageDescription}>Manage plastic granule stock and consumption</p>
                </div>
                <button className={styles.primaryButton} onClick={handleOpenAddModal}>
                    <Plus size={18} style={{ marginRight: '8px' }} />
                    Add Material
                </button>
            </div>

            {/* Stats Cards */}
            {!loading && !error && (
                <div className={styles.statsRow}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #6b7280, #4b5563)' }}>
                            <Boxes size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{formatNumber(totalStock)} kg</div>
                            <div className={styles.statLabel}>Total Raw Material Stock</div>
                            <div className={styles.statSublabel}>Across all materials</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                            <Filter size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{materialCount}</div>
                            <div className={styles.statLabel}>Material Types</div>
                            <div className={styles.statSublabel}>Unique materials</div>
                        </div>
                    </div>
                    {lowStockCount > 0 && (
                        <div className={cn(styles.statCard, styles.statCardWarning)}>
                            <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                <AlertTriangle size={28} />
                            </div>
                            <div className={styles.statContent}>
                                <div className={styles.statValue}>{lowStockCount}</div>
                                <div className={styles.statLabel}>Low Stock Alerts</div>
                                <div className={styles.statSublabel}>Below threshold</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Filter Bar */}
            {!loading && !error && materials.length > 0 && (
                <div className={styles.filterBar}>
                    <div className={styles.filterRow}>
                        <div className={styles.filterGroup}>
                            <Search size={16} className={styles.filterIcon} />
                            <div className={styles.searchBox}>
                                <input
                                    type="text"
                                    className={styles.filterInput}
                                    placeholder="Search materials..."
                                    value={filters.search}
                                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className={styles.error}>
                    <p>Error: {error}</p>
                    <button className={styles.retryButton} onClick={() => refetch()}>
                        Retry
                    </button>
                </div>
            )}

            {/* Content */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading materials...</span>
                    </div>
                ) : materials.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Boxes size={48} />
                        <p>No raw materials configured</p>
                    </div>
                ) : filteredMaterials.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Search size={48} />
                        <p>No materials found matching your search</p>
                        <p className="text-muted">Try adjusting your search criteria</p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Material</th>
                                    <th>Type</th>
                                    <th style={{ textAlign: 'right' }}>Current Stock</th>
                                    <th style={{ textAlign: 'right' }}>Min Threshold</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMaterials.map((material) => {
                                    const isLow = material.stock_weight_kg < (material.min_threshold_kg || 100);
                                    return (
                                        <tr key={material.id}>
                                            <td className={styles.nameCell}>{material.name}</td>
                                            <td>
                                                <span className={cn(styles.badge, styles.badgeGray)}>{material.type || 'Granule'}</span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className={cn(styles.stockValue, isLow && styles.lowStock)}>
                                                    {formatNumber(material.stock_weight_kg)} kg
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }} className={styles.textMuted}>
                                                {formatNumber(material.min_threshold_kg || 100)} kg
                                            </td>
                                            <td>
                                                {isLow ? (
                                                    <span className={cn(styles.badge, styles.badgeError)}>Low Stock</span>
                                                ) : (
                                                    <span className={cn(styles.badge, styles.badgeSuccess)}>OK</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        className={styles.actionButton}
                                                        onClick={() => handleAdjust(material)}
                                                    >
                                                        Adjust Stock
                                                    </button>
                                                    <button
                                                        className={cn(styles.actionButton, styles.secondaryAction)}
                                                        onClick={() => handleEdit(material)}
                                                        style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-color)' }}
                                                    >
                                                        Edit
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Adjustment Modal */}
            {isAdjustModalOpen && selectedMaterial && (
                <div className={styles.modalBackdrop} onClick={() => setIsAdjustModalOpen(false)}>
                    <div className={cn(styles.modal, styles.wideModal)} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Adjust Stock: {selectedMaterial.name}</h2>
                            <button onClick={() => setIsAdjustModalOpen(false)} className={styles.closeBtn}>
                                <Plus size={20} style={{ transform: 'rotate(45deg)' }} />
                            </button>
                        </div>
                        <form onSubmit={handleAdjustSubmit}>
                            <div className={styles.modalBody}>
                                <div className={cn(styles.formGroup, styles['mb-24'])}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label className={styles.formLabel} style={{ margin: 0 }}>Current Stock</label>
                                        <span className={styles.badgeGray}>{selectedMaterial.stock_weight_kg?.toFixed(1) || '0.0'} kg</span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className={styles['mb-24']}>
                                    <div className={styles.formGroup}>
                                        <label className={cn(styles.formLabel, styles['mb-8'])}>Quantity *</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            value={adjustmentData.quantity ?? ''}
                                            onChange={(e) => setAdjustmentData({ ...adjustmentData, quantity: e.target.value === '' ? '' : e.target.value })}
                                            required
                                            min="0"
                                            step="0.01"
                                            placeholder="Enter amount"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={cn(styles.formLabel, styles['mb-8'])}>Unit *</label>
                                        <select
                                            className={styles.formSelect}
                                            value={adjustmentData.unit}
                                            onChange={(e) => setAdjustmentData({ ...adjustmentData, unit: e.target.value })}
                                        >
                                            <option value="kg">kg</option>
                                            <option value="bags">Bags (25kg)</option>
                                            <option value="tons">Tons (1000kg / 40 Bags)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className={cn(styles.formGroup, styles['mb-24'])}>
                                    <label className={cn(styles.formLabel, styles['mb-8'])}>Rate per Kilo (₹) *</label>
                                    <input
                                        type="number"
                                        className={styles.formInput}
                                        value={adjustmentData.rate ?? ''}
                                        onChange={(e) => setAdjustmentData({ ...adjustmentData, rate: e.target.value === '' ? '' : e.target.value })}
                                        required
                                        min="0"
                                        step="0.01"
                                        placeholder="Current market rate per kg"
                                    />
                                </div>

                                {adjustmentData.quantity && adjustmentData.rate && (
                                    <div className={styles.costSummary}>
                                        <div className={styles.costRow}>
                                            <span className={styles.costLabel}>Operational Breakdown</span>
                                            <span className={styles.costFormula}>
                                                {(() => {
                                                    const qty = parseFloat(adjustmentData.quantity);
                                                    const weight = adjustmentData.unit === 'bags' ? qty * 25 : adjustmentData.unit === 'tons' ? qty * 1000 : qty;
                                                    const bags = weight / 25;
                                                    return (
                                                        <>
                                                            {formatNumber(weight)} kg <strong>({formatNumber(bags)} Bags)</strong> × ₹{adjustmentData.rate}
                                                        </>
                                                    );
                                                })()}
                                            </span>
                                        </div>
                                        <div className={styles.costRow}>
                                            <span className={styles.costLabel}>Total Procurement Value</span>
                                            <span className={styles.costValue}>
                                                {formatCurrency(
                                                    (adjustmentData.unit === 'bags'
                                                        ? parseFloat(adjustmentData.quantity) * 25
                                                        : adjustmentData.unit === 'tons'
                                                            ? parseFloat(adjustmentData.quantity) * 1000
                                                            : parseFloat(adjustmentData.quantity)
                                                    ) * parseFloat(adjustmentData.rate)
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className={cn(styles.formGroup, styles['mb-24'])}>
                                    <label className={cn(styles.formLabel, styles['mb-8'])}>Reason / Reference *</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={adjustmentReason}
                                        onChange={(e) => setAdjustmentReason(e.target.value)}
                                        required
                                        placeholder="e.g., Purchase from Vendor X"
                                    />
                                </div>

                                <div className={cn(styles.formGroup, styles['mb-24'])}>
                                    <label className={cn(styles.formLabel, styles['mb-8'])}>Payment Mode *</label>
                                    <div className={styles.typeButtons}>
                                        <button
                                            type="button"
                                            className={cn(styles.typeBtn, paymentMode === 'Cash' && styles.active)}
                                            onClick={() => setPaymentMode('Cash')}
                                        >
                                            <Wallet size={16} />
                                            Cash
                                        </button>
                                        <button
                                            type="button"
                                            className={cn(styles.typeBtn, paymentMode === 'Credit' && styles.active)}
                                            onClick={() => setPaymentMode('Credit')}
                                        >
                                            <CreditCard size={16} />
                                            Credit
                                        </button>
                                    </div>
                                    <div className={cn(
                                        styles.disclaimer,
                                        paymentMode === 'Cash' ? styles.disclaimerSuccess : styles.disclaimerWarning
                                    )}>
                                        {paymentMode === 'Cash' ? (
                                            <>
                                                <div style={{ color: 'var(--success)' }}>✓</div>
                                                <span>Will automatically create a Cash Flow entry.</span>
                                            </>
                                        ) : (
                                            <>
                                                <div style={{ color: 'var(--warning)' }}>⚠</div>
                                                <span>Stock will be added, but NO cash flow entry will be created.</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.secondaryButton} onClick={() => setIsAdjustModalOpen(false)}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={saving || !adjustmentData.quantity || !adjustmentData.rate || !adjustmentReason}
                                >
                                    {saving ? <Loader2 size={16} className={styles.spinner} /> : 'Complete Adjustment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add/Edit Material Modal */}
            {(isAddModalOpen || isEditModalOpen) && (
                <div className={styles.modalBackdrop} onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{isEditModalOpen ? 'Edit Material' : 'Add New Material'}</h2>
                            <button onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }} className={styles.closeBtn}>
                                <Plus size={20} style={{ transform: 'rotate(45deg)' }} />
                            </button>
                        </div>
                        <form onSubmit={isEditModalOpen ? handleEditSubmit : handleCreateSubmit}>
                            <div className={styles.modalBody}>
                                {isAddModalOpen && factories.length > 0 && (
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Factory *</label>
                                        <FactorySelect
                                            value={formData.factory_id}
                                            onChange={(val) => setFormData({ ...formData, factory_id: val })}
                                        />
                                    </div>
                                )}
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Material Name *</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        placeholder="e.g. Polypropylene Granules"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Material Type</label>
                                    <select
                                        className={styles.formInput}
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        <option value="Granule">Granule (Virgin)</option>
                                        <option value="Reprocessed">Reprocessed (Recycled)</option>
                                        <option value="Color">Color Masterbatch</option>
                                        <option value="Additive">Additive</option>
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Standard Bag Weight (kg)</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            value={formData.bag_weight_kg ?? ''}
                                            onChange={(e) => setFormData({ ...formData, bag_weight_kg: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                                            required
                                            min="1"
                                            step="0.5"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Min Threshold (kg)</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            value={formData.min_threshold_kg ?? ''}
                                            onChange={(e) => setFormData({ ...formData, min_threshold_kg: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                                            required
                                            min="0"
                                        />
                                    </div>
                                </div>
                                {isAddModalOpen && (
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Initial Stock (kg)</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            value={formData.stock_weight_kg ?? ''}
                                            onChange={(e) => setFormData({ ...formData, stock_weight_kg: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                                            required
                                            min="0"
                                            placeholder="0"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.secondaryButton} onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}>
                                    Cancel
                                </button>
                                <button type="submit" className={styles.submitButton} disabled={saving}>
                                    {saving ? <Loader2 size={16} className={styles.spinner} /> : (isEditModalOpen ? 'Save Changes' : 'Create Material')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )
            }
        </>
    );
}

