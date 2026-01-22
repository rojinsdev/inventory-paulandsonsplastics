'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUI } from '@/contexts/UIContext';
import { Loader2, Plus, Minus, History, Boxes, AlertTriangle, Search, Filter } from 'lucide-react';
import { inventoryAPI } from '@/lib/api';
import { formatNumber, formatCurrency, formatDate, cn } from '@/lib/utils';
import { useGuide } from '@/contexts/GuideContext';
import styles from './page.module.css';

export default function RawMaterialsPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [materials, setMaterials] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [adjusting, setAdjusting] = useState(null);
    const [saving, setSaving] = useState(false);
    const [filters, setFilters] = useState({
        search: '',
    });

    const [adjustmentData, setAdjustmentData] = useState({
        type: 'add',
        quantity: '',
        reason: '',
    });

    const [newData, setNewData] = useState({
        name: '',
        stock_weight_kg: ''
    });

    useEffect(() => {
        loadMaterials();
    }, []);

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

    const loadMaterials = async () => {
        try {
            setLoading(true);
            const data = await inventoryAPI.getRawMaterials();
            setMaterials(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

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
        setAdjusting(material);
        setAdjustmentData({
            type: 'add',
            quantity: '',
            reason: '',
        });
        setModalOpen(true);
    };

    const handleSubmitAdjustment = async (e) => {
        e.preventDefault();
        if (!adjusting) return;
        setSaving(true);

        try {
            const quantity = Number(adjustmentData.quantity);
            const adjustedQty = adjustmentData.type === 'subtract' ? -quantity : quantity;

            await inventoryAPI.adjustRawMaterial(adjusting.id, {
                quantity_kg: adjustedQty,
                reason: adjustmentData.reason,
            });

            setModalOpen(false);
            loadMaterials();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await inventoryAPI.createRawMaterial({
                name: newData.name,
                stock_weight_kg: Number(newData.stock_weight_kg)
            });
            setCreateModalOpen(false);
            setNewData({ name: '', stock_weight_kg: '' });
            loadMaterials();
        } catch (err) {
            alert('Error creating material: ' + err.message);
        } finally {
            setSaving(false);
        }
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
                <button className="btn btn-primary" onClick={() => setCreateModalOpen(true)}>
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
                    <button className="btn btn-secondary" onClick={loadMaterials}>
                        Retry
                    </button>
                </div>
            )}

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading materials...</span>
                    </div>
                ) : materials.length === 0 ? (
                    <div className="empty-state">
                        <Boxes size={48} />
                        <p>No raw materials configured</p>
                    </div>
                ) : filteredMaterials.length === 0 ? (
                    <div className="empty-state">
                        <Search size={48} />
                        <p>No materials found matching your search</p>
                        <p className="text-muted">Try adjusting your search criteria</p>
                    </div>
                ) : (
                    <table className="table">
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
                                        <td className="font-medium">{material.name}</td>
                                        <td>
                                            <span className="badge badge-gray">{material.type || 'Granule'}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className={cn(styles.stockValue, isLow && styles.lowStock)}>
                                                {formatNumber(material.stock_weight_kg)} kg
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }} className="text-muted">
                                            {formatNumber(material.min_threshold_kg || 100)} kg
                                        </td>
                                        <td>
                                            {isLow ? (
                                                <span className="badge badge-error">Low Stock</span>
                                            ) : (
                                                <span className="badge badge-success">OK</span>
                                            )}
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-sm btn-outline"
                                                onClick={() => handleAdjust(material)}
                                            >
                                                Adjust
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Adjustment Modal */}
            {modalOpen && adjusting && (
                <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Adjust Stock: {adjusting.name}</h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleSubmitAdjustment}>
                            <div className="modal-body">
                                <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
                                    Current stock: <strong>{formatNumber(adjusting.stock_weight_kg)} kg</strong>
                                </p>

                                <div className="form-group">
                                    <label className="form-label">Adjustment Type *</label>
                                    <div className={styles.typeButtons}>
                                        <button
                                            type="button"
                                            className={cn(styles.typeBtn, adjustmentData.type === 'add' && styles.active)}
                                            onClick={() => setAdjustmentData({ ...adjustmentData, type: 'add' })}
                                        >
                                            <Plus size={18} />
                                            Add Stock
                                        </button>
                                        <button
                                            type="button"
                                            className={cn(styles.typeBtn,
                                                adjustmentData.type === 'subtract' && styles.active,
                                                adjustmentData.type === 'subtract' && styles.subtract
                                            )}
                                            onClick={() => setAdjustmentData({ ...adjustmentData, type: 'subtract' })}
                                        >
                                            <Minus size={18} />
                                            Remove Stock
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Quantity (kg) *</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={adjustmentData.quantity}
                                        onChange={(e) =>
                                            setAdjustmentData({ ...adjustmentData, quantity: e.target.value })
                                        }
                                        required
                                        min="0.1"
                                        step="0.1"
                                        placeholder="Enter quantity in kg"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Reason *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={adjustmentData.reason}
                                        onChange={(e) =>
                                            setAdjustmentData({ ...adjustmentData, reason: e.target.value })
                                        }
                                        required
                                        placeholder="e.g., New purchase, Wastage adjustment"
                                    />
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? (
                                        <>
                                            <Loader2 size={16} className={styles.spinner} />
                                            Saving...
                                        </>
                                    ) : (
                                        'Confirm Adjustment'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {createModalOpen && (
                <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Add New Material</h2>
                            <button onClick={() => setCreateModalOpen(false)} className={styles.closeBtn}>
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Material Name *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={newData.name}
                                        onChange={(e) => setNewData({ ...newData, name: e.target.value })}
                                        required
                                        placeholder="e.g. Polypropylene Granules"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Initial Stock (kg) *</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={newData.stock_weight_kg}
                                        onChange={(e) => setNewData({ ...newData, stock_weight_kg: e.target.value })}
                                        required
                                        min="0"
                                        step="0.1"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setCreateModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Creating...' : 'Create Material'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
