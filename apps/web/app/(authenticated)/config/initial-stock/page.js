'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    inventoryAPI, 
    productsAPI, 
    capsAPI, 
    innersAPI 
} from '@/lib/api';
import { 
    AlertTriangle, 
    Save, 
    Info, 
    Box, 
    Disc, 
    Layers, 
    CheckCircle2, 
    XCircle,
    Loader2,
    Search,
    RefreshCw
} from 'lucide-react';
import { useUI } from '@/contexts/UIContext';
import { useFactory } from '@/contexts/FactoryContext';
import { formatNumber, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import styles from './page.module.css';

const TABS = [
    { id: 'raw_materials', label: 'Raw Materials', icon: Info },
    { id: 'tubs', label: 'Tubs (Products)', icon: Box },
    { id: 'caps', label: 'Caps', icon: Disc },
    { id: 'inners', label: 'Inners', icon: Layers },
];

export default function InitialStockLoading() {
    const { setPageTitle } = useUI();
    const { selectedFactory } = useFactory();
    const [activeTab, setActiveTab] = useState('raw_materials');
    const [searchQuery, setSearchQuery] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [status, setStatus] = useState(null);

    // Input state: { [type_id_state_unit]: quantity }
    const [stockInputs, setStockInputs] = useState({});

    useEffect(() => {
        setPageTitle('Initial Stock Loading');
    }, [setPageTitle]);

    // Data Fetching
    const { data: rawMaterialsData, isLoading: loadingRM, refetch: refetchRM } = useQuery({
        queryKey: ['raw-materials-init', selectedFactory],
        queryFn: () => inventoryAPI.getRawMaterials({ factory_id: selectedFactory, limit: 200 }),
        enabled: !!selectedFactory
    });

    const { data: productsData, isLoading: loadingProducts, refetch: refetchProducts } = useQuery({
        queryKey: ['products-init', selectedFactory],
        queryFn: () => productsAPI.getAll({ factory_id: selectedFactory, limit: 300 }),
        enabled: !!selectedFactory
    });

    const { data: capsData, isLoading: loadingCaps, refetch: refetchCaps } = useQuery({
        queryKey: ['caps-init', selectedFactory],
        queryFn: () => capsAPI.getAll({ factory_id: selectedFactory }),
        enabled: !!selectedFactory
    });

    const { data: innersData, isLoading: loadingInners, refetch: refetchInners } = useQuery({
        queryKey: ['inners-init', selectedFactory],
        queryFn: () => innersAPI.getAll({ factory_id: selectedFactory }),
        enabled: !!selectedFactory
    });

    const isLoading = loadingRM || loadingProducts || loadingCaps || loadingInners;

    // Computed Lists - Robust extraction
    const rawMaterials = useMemo(() => {
        if (!rawMaterialsData) return [];
        return rawMaterialsData.rawMaterials || rawMaterialsData.materials || rawMaterialsData.data || (Array.isArray(rawMaterialsData) ? rawMaterialsData : []);
    }, [rawMaterialsData]);

    const products = useMemo(() => {
        if (!productsData) return [];
        return productsData.products || productsData.data || (Array.isArray(productsData) ? productsData : []);
    }, [productsData]);

    const caps = useMemo(() => {
        if (!capsData) return [];
        return capsData.caps || capsData.data || (Array.isArray(capsData) ? capsData : []);
    }, [capsData]);

    const inners = useMemo(() => {
        if (!innersData) return [];
        return innersData.inners || innersData.data || (Array.isArray(innersData) ? innersData : []);
    }, [innersData]);

    // Filtered Lists
    const filteredRawMaterials = useMemo(() => 
        rawMaterials.filter(m => (m.name || '').toLowerCase().includes(searchQuery.toLowerCase())),
    [rawMaterials, searchQuery]);

    const filteredProducts = useMemo(() => 
        products.filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.size || '').toLowerCase().includes(searchQuery.toLowerCase())),
    [products, searchQuery]);

    const filteredCaps = useMemo(() => 
        caps.filter(c => (c.name || '').toLowerCase().includes(searchQuery.toLowerCase())),
    [caps, searchQuery]);

    const filteredInners = useMemo(() => 
        inners.filter(i => ((i.template?.name || i.name) || 'Inner').toLowerCase().includes(searchQuery.toLowerCase())),
    [inners, searchQuery]);

    const handleInputChange = (type, id, quantity, state = '', unitType = '') => {
        const key = `${type}_${id}_${state}_${unitType}`;
        setStockInputs(prev => ({
            ...prev,
            [key]: quantity === '' ? '' : parseFloat(quantity)
        }));
    };

    const handleRefresh = () => {
        refetchRM();
        refetchProducts();
        refetchCaps();
        refetchInners();
        setStockInputs({});
        setStatus(null);
        toast.success('Catalog refreshed');
    };

    const handleSubmit = async () => {
        if (!selectedFactory) {
            toast.error('No factory selected');
            return;
        }

        const items = Object.entries(stockInputs)
            .filter(([_, qty]) => qty !== '' && !isNaN(qty) && parseFloat(qty) !== 0)
            .map(([key, qty]) => {
                const [type, id, state, unitType] = key.split('_');
                return {
                    type,
                    id,
                    quantity: qty,
                    state: state || undefined,
                    unit_type: unitType || undefined
                };
            });

        if (items.length === 0) {
            toast.error('No stock quantities entered');
            return;
        }

        if (!confirm(`Are you sure you want to initialize ${items.length} items? This action cannot be undone.`)) return;

        setSubmitting(true);
        setStatus(null);

        try {
            const result = await inventoryAPI.bulkInitialize({
                factoryId: selectedFactory,
                items
            });

            const failed = result.details?.filter(d => !d.success) || [];
            if (failed.length > 0) {
                setStatus({
                    type: 'error',
                    message: `${failed.length} items failed. See console for details.`,
                    details: result.details
                });
                toast.error('Partial success. Check status details.');
            } else {
                setStatus({
                    type: 'success',
                    message: 'Stock initialized successfully!',
                    details: result.details
                });
                toast.success('Inventory updated successfully');
                setStockInputs({});
                handleRefresh();
            }
        } catch (err) {
            console.error('Bulk init error:', err);
            toast.error(err.message || 'Initialization failed');
            setStatus({ type: 'error', message: err.message });
        } finally {
            setSubmitting(false);
        }
    };

    const renderRawMaterials = () => (
        <div className={styles.tableWrapper}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Material Name</th>
                        <th>Type</th>
                        <th style={{ textAlign: 'right' }}>Initial Quantity (KG)</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredRawMaterials.length === 0 ? (
                        <tr><td colSpan="3" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No materials found</td></tr>
                    ) : filteredRawMaterials.map(rm => (
                        <tr key={rm.id}>
                            <td><span className={styles.nameCell}>{rm.name}</span></td>
                            <td><span className={styles.badgeGray}>{rm.type}</span></td>
                            <td style={{ textAlign: 'right' }}>
                                <input 
                                    type="number" 
                                    className={styles.formInput}
                                    placeholder="0.00"
                                    value={stockInputs[`raw_material_${rm.id}__`] ?? ''}
                                    onChange={(e) => handleInputChange('raw_material', rm.id, e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderTubs = () => (
        <div className={styles.tableWrapper}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Product / Tub</th>
                        <th>Packaging Details (Enter Count)</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredProducts.length === 0 ? (
                        <tr><td colSpan="2" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No products found</td></tr>
                    ) : filteredProducts.map(prod => (
                        <tr key={prod.id}>
                            <td style={{ width: '300px' }}>
                                <span className={styles.nameCell}>{prod.name}</span>
                                <span className={styles.dimText}>{prod.size} - {prod.color}</span>
                            </td>
                            <td>
                                <div className={styles.variantsGrid}>
                                    <div className={styles.variantCell}>
                                        <label className={styles.variantLabel}>Loose</label>
                                        <input 
                                            type="number" 
                                            className={styles.formInput}
                                            placeholder="0"
                                            value={stockInputs[`product_${prod.id}_semi_finished_`] ?? ''}
                                            onChange={(e) => handleInputChange('product', prod.id, e.target.value, 'semi_finished')}
                                        />
                                    </div>
                                    <div className={styles.variantCell}>
                                        <label className={styles.variantLabel}>Packet</label>
                                        <input 
                                            type="number" 
                                            className={styles.formInput}
                                            placeholder="0"
                                            value={stockInputs[`product_${prod.id}_packed_packet`] ?? ''}
                                            onChange={(e) => handleInputChange('product', prod.id, e.target.value, 'packed', 'packet')}
                                        />
                                    </div>
                                    <div className={styles.variantCell}>
                                        <label className={styles.variantLabel}>Bundle</label>
                                        <input 
                                            type="number" 
                                            className={styles.formInput}
                                            placeholder="0"
                                            value={stockInputs[`product_${prod.id}_packed_bundle`] ?? ''}
                                            onChange={(e) => handleInputChange('product', prod.id, e.target.value, 'packed', 'bundle')}
                                        />
                                    </div>
                                    <div className={styles.variantCell}>
                                        <label className={styles.variantLabel}>Bag</label>
                                        <input 
                                            type="number" 
                                            className={styles.formInput}
                                            placeholder="0"
                                            value={stockInputs[`product_${prod.id}_packed_bag`] ?? ''}
                                            onChange={(e) => handleInputChange('product', prod.id, e.target.value, 'packed', 'bag')}
                                        />
                                    </div>
                                    <div className={styles.variantCell}>
                                        <label className={styles.variantLabel}>Box</label>
                                        <input 
                                            type="number" 
                                            className={styles.formInput}
                                            placeholder="0"
                                            value={stockInputs[`product_${prod.id}_packed_box`] ?? ''}
                                            onChange={(e) => handleInputChange('product', prod.id, e.target.value, 'packed', 'box')}
                                        />
                                    </div>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderCaps = () => (
        <div className={styles.tableWrapper}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Cap Variant</th>
                        <th>Color</th>
                        <th style={{ textAlign: 'right' }}>Initial Quantity</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredCaps.length === 0 ? (
                        <tr><td colSpan="3" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No caps found</td></tr>
                    ) : filteredCaps.map(cap => (
                        <tr key={cap.id}>
                            <td><span className={styles.nameCell}>{cap.name}</span></td>
                            <td><span className={styles.badgeGray}>{cap.color}</span></td>
                            <td style={{ textAlign: 'right' }}>
                                <input 
                                    type="number" 
                                    className={styles.formInput}
                                    placeholder="0"
                                    value={stockInputs[`cap_${cap.id}__`] ?? ''}
                                    onChange={(e) => handleInputChange('cap', cap.id, e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderInners = () => (
        <div className={styles.tableWrapper}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Inner Variant</th>
                        <th>Color</th>
                        <th style={{ textAlign: 'right' }}>Initial Quantity</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredInners.length === 0 ? (
                        <tr><td colSpan="3" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No inners found</td></tr>
                    ) : filteredInners.map(inner => (
                        <tr key={inner.id}>
                            <td><span className={styles.nameCell}>{inner.template?.name || 'Standard Inner'}</span></td>
                            <td><span className={styles.badgeGray}>{inner.color}</span></td>
                            <td style={{ textAlign: 'right' }}>
                                <input 
                                    type="number" 
                                    className={styles.formInput}
                                    placeholder="0"
                                    value={stockInputs[`inner_${inner.id}__`] ?? ''}
                                    onChange={(e) => handleInputChange('inner', inner.id, e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Initial Stock Loading</h1>
                    <p className={styles.pageDescription}>Bulk initialize factory inventory levels from historical data.</p>
                </div>
                <button className={styles.secondaryButton} onClick={handleRefresh} disabled={isLoading}>
                    <RefreshCw size={18} className={isLoading ? styles.spinner : ''} />
                    Refresh Catalog
                </button>
            </div>

            {/* Stats Row - System Style */}
            {!isLoading && (
                <div className={styles.statsRow}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #6b7280, #4b5563)' }}>
                            <Info size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{rawMaterials.length}</div>
                            <div className={styles.statLabel}>Raw Materials</div>
                            <div className={styles.statSublabel}>Available for entry</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
                            <Box size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{products.length}</div>
                            <div className={styles.statLabel}>Tubs / Products</div>
                            <div className={styles.statSublabel}>Variants available</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                            <Disc size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{caps.length + inners.length}</div>
                            <div className={styles.statLabel}>Caps & Inners</div>
                            <div className={styles.statSublabel}>Other inventory</div>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.warningBanner}>
                <AlertTriangle size={24} className={styles.warningIcon} style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }} />
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: 'var(--text-main)' }}>Wait, Read Before You Initialize!</h3>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-main)' }}>
                        <li><strong>Additive Operation:</strong> The quantities you enter here are <strong>ADDED</strong> to the existing stock. They <strong>DO NOT</strong> replace current values. <em>(e.g., if you have 10 and enter 5, the new total will be 15)</em>.</li>
                        <li><strong>Blank Fields:</strong> Leaving a field empty means no changes will be made to that item.</li>
                        <li><strong>Audit Trail:</strong> Every non-empty value generates an <code>initial_load</code> transaction, ensuring the operation is trackable in logs.</li>
                        <li><strong>Reversibility:</strong> Please double-check your numbers. If you make a mistake, you will need to manually log a negative adjustment (consumption/disposal) to correct it.</li>
                    </ul>
                </div>
            </div>

            <div className={styles.filterBar}>
                <div className={styles.tabs}>
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                className={cn(styles.tab, activeTab === tab.id && styles.tabActive)}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <Icon size={18} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
                <div className={styles.searchBox}>
                    <Search size={18} className={styles.searchIcon} />
                    <input 
                        type="text" 
                        className={styles.filterInput}
                        placeholder="Search items to initialize..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.tableCard}>
                {isLoading ? (
                    <div className={styles.loading}>
                        <Loader2 className={styles.spinner} size={40} />
                        <p>Loading factory catalog...</p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        {activeTab === 'raw_materials' && renderRawMaterials()}
                        {activeTab === 'tubs' && renderTubs()}
                        {activeTab === 'caps' && renderCaps()}
                        {activeTab === 'inners' && renderInners()}
                    </div>
                )}
            </div>

            {status && (
                <div className={styles.warningBanner} style={{ marginTop: '2rem', backgroundColor: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderColor: status.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)' }}>
                    {status.type === 'success' ? <CheckCircle2 size={24} style={{ color: '#10b981' }} /> : <XCircle size={24} style={{ color: '#ef4444' }} />}
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem', color: 'var(--text-main)' }}>{status.message}</div>
                        {status.type === 'success' && <p style={{ margin: 0, color: 'var(--text-muted)' }}>System logs have been updated with initialization transactions.</p>}
                    </div>
                </div>
            )}

            <div className={styles.actionFooter}>
                <div className={styles.countInfo}>
                    {Object.keys(stockInputs).length > 0 && (
                        <span>{Object.keys(stockInputs).length} items ready to initialize</span>
                    )}
                </div>
                <div className={styles.actionGroup}>
                    <button 
                        className={styles.secondaryButton}
                        onClick={() => setStockInputs({})}
                    >
                        Reset Inputs
                    </button>
                    <button 
                        className={styles.submitButton}
                        onClick={handleSubmit}
                        disabled={isLoading || submitting || Object.keys(stockInputs).length === 0}
                    >
                        {submitting ? <Loader2 className={styles.spinner} size={18} /> : <Save size={18} />}
                        {submitting ? 'Initializing Stock...' : 'Confirm Bulk Initialization'}
                    </button>
                </div>
            </div>

            {submitting && (
                <div className={styles.overlay}>
                    <div className={styles.overlayContent}>
                        <Loader2 className={styles.spinner} size={48} />
                        <h2>Processing Stock Data</h2>
                        <p>Validating and updating balances. Do not leave this page.</p>
                    </div>
                </div>
            )}
        </>
    );
}
