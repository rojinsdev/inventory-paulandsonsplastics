'use client';

import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Plus, 
    ShoppingCart, 
    Loader2, 
    Search,
    Calendar,
    Tag,
    Database,
    AlertCircle,
    CheckCircle2,
    CalendarDays,
    Factory as FactoryIcon,
} from 'lucide-react';
import { purchasesAPI, suppliersAPI, inventoryAPI, cashFlowAPI, productTemplatesAPI, productsAPI } from '@/lib/api';
import { useFactory } from '@/contexts/FactoryContext';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import styles from '../CompanyDealings.module.css';

function resolveDefaultFactoryId(selectedFactory, factoriesList) {
    if (typeof selectedFactory === 'string' && selectedFactory) return selectedFactory;
    if (selectedFactory && typeof selectedFactory === 'object' && selectedFactory.id) return selectedFactory.id;
    return factoriesList?.[0]?.id || '';
}

export default function PurchasesTab({ suppliers = [] }) {
    const queryClient = useQueryClient();
    const { selectedFactory, factories } = useFactory();
    const [modalOpen, setModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [selectedTemplateId, setSelectedTemplateId] = useState('');

    const [formData, setFormData] = useState({
        factory_id: '',
        supplier_id: '',
        purchase_type: 'raw_material', // raw_material, finished_product, other
        item_id: '', // for raw material OR product variant
        cap_id: '', // optional for finished product
        packaging_unit: 'Bundle', // Loose, Packed, Bag, Bundle, Box
        description: '', // for other expenses
        quantity: '', // used for raw material (kg)
        unit_count: '', // used for finished product (count of bundles/loose etc)
        rate: '',
        total_amount: 0,
        paid_amount: 0,
        payment_method: 'Cash',
        due_date: '',
        unit: '',
        notes: '',
    });

    // Queries
    const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
        queryKey: ['purchases'],
        queryFn: () => purchasesAPI.getAll(),
    });

    const effectiveFactoryId = formData.factory_id || resolveDefaultFactoryId(selectedFactory, factories);

    const { data: rawMaterialsData = { rawMaterials: [] } } = useQuery({
        queryKey: ['rawMaterials', 'purchase-modal', effectiveFactoryId],
        queryFn: () =>
            inventoryAPI.getRawMaterials({
                factory_id: effectiveFactoryId,
                size: 500,
                page: 1,
            }),
        enabled: modalOpen && !!effectiveFactoryId,
    });
    const rawMaterials = rawMaterialsData.rawMaterials || [];

    const { data: productTemplates = [] } = useQuery({
        queryKey: ['productTemplates', effectiveFactoryId],
        queryFn: () => productTemplatesAPI.getAll({ factory_id: effectiveFactoryId }),
        enabled: modalOpen && !!effectiveFactoryId
    });

    const { data: products = [] } = useQuery({
        queryKey: ['products', effectiveFactoryId],
        queryFn: () => productsAPI.getAll({ factory_id: effectiveFactoryId }),
        enabled: modalOpen && !!effectiveFactoryId
    });

    React.useEffect(() => {
        if (!modalOpen) return;
        const def = resolveDefaultFactoryId(selectedFactory, factories);
        setFormData((prev) => {
            if (prev.factory_id && factories?.some((f) => f.id === prev.factory_id)) return prev;
            return { ...prev, factory_id: def };
        });
    }, [modalOpen, selectedFactory, factories]);

    // Mutations
    const purchaseMutation = useMutation({
        mutationFn: (data) => purchasesAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
            setModalOpen(false);
            resetForm();
        },
        onError: (err) => alert(err.message)
    });

    const resetForm = () => {
        setFormData({
            factory_id: resolveDefaultFactoryId(selectedFactory, factories),
            supplier_id: '',
            purchase_type: 'raw_material',
            item_id: '',
            cap_id: '',
            packaging_unit: 'Bundle',
            description: '',
            quantity: '',
            unit_count: '',
            rate: '',
            total_amount: 0,
            paid_amount: 0,
            payment_method: 'Cash',
            due_date: '',
            unit: '',
            notes: '',
        });
        setSelectedTemplateId('');
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Auto-calculate Total and Description for Finished Products
    React.useEffect(() => {
        if (formData.purchase_type === 'finished_product') {
            const product = products.find(p => p.id === formData.item_id);
            const template = productTemplates.find(t => t.id === selectedTemplateId);
            
            if (product && template) {
                const desc = `Purchase of ${template.name} (${template.size}) - ${product.color} [${formData.packaging_unit}]`;
                if (formData.description !== desc) {
                    setFormData(prev => ({ ...prev, description: desc }));
                }
            }
        }
    }, [formData.item_id, selectedTemplateId, formData.packaging_unit, products, productTemplates, formData.description, formData.purchase_type]);

    // Auto-calculate Total Amount
    React.useEffect(() => {
        const qtyValue = formData.purchase_type === 'raw_material' ? formData.quantity : formData.unit_count;
        const qty = Number(qtyValue) || 0;
        const rate = Number(formData.rate) || 0;
        const total = Number((qty * rate).toFixed(2));
        
        if (formData.total_amount !== total) {
            setFormData(prev => {
                const updated = { ...prev, total_amount: total };
                // Default paid amount to total if it was previously equal or zero
                if (prev.paid_amount === prev.total_amount || prev.paid_amount === 0) {
                    updated.paid_amount = total;
                }
                return updated;
            });
        }
    }, [formData.quantity, formData.unit_count, formData.rate, formData.purchase_type, formData.total_amount]);

    const balanceDue = Number(Math.max(0, formData.total_amount - formData.paid_amount).toFixed(2));
    const isCreditPurchase = balanceDue > 0;

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.supplier_id) return alert('Please select a supplier');
        if (formData.purchase_type === 'raw_material' && !formData.item_id) return alert('Please select a raw material');
        if (formData.purchase_type === 'finished_product' && !formData.item_id) return alert('Please select a product variant');
        if (formData.purchase_type === 'other' && !formData.description) return alert('Please enter a description');
        
        const factoryId = formData.factory_id || resolveDefaultFactoryId(selectedFactory, factories);
        if (!factoryId) return alert('Please select which factory this purchase is for.');

        // Cast types for the backend
        const submissionData = {
            ...formData,
            quantity: formData.purchase_type === 'raw_material' ? Number(formData.quantity || 0) : undefined,
            unit_count: formData.purchase_type === 'finished_product' ? Number(formData.unit_count || 0) : undefined,
            product_id: formData.purchase_type === 'finished_product' ? formData.item_id : undefined,
            raw_material_id: formData.purchase_type === 'raw_material' ? formData.item_id : undefined,
            item_type: formData.purchase_type === 'raw_material' ? 'Raw Material' 
                     : formData.purchase_type === 'finished_product' ? 'Finished Product' 
                     : 'Other',
            rate: Number(formData.rate || 0),
            total_amount: Number(formData.total_amount || 0),
            paid_amount: Number(formData.paid_amount || 0),
            factory_id: factoryId,
        };
        
        purchaseMutation.mutate(submissionData);
    };

    const filteredPurchases = purchases.filter(p => 
        p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loadingPurchases) return <div className={cn(styles.flex, styles.itemsCenter, styles.justifyCenter, styles.p12)}><Loader2 className={cn(styles.animateSpin, styles.textPrimary)} /></div>;

    return (
        <div className={styles.tabContentInner}>
            <div className={styles.tableWrapper}>
                <div className={styles.filterContainer}>
                    <div className={styles.filterRow}>
                        <div className={styles.searchBox}>
                            <Search className={styles.filterIcon} size={20} />
                            <input
                                type="text"
                                placeholder="Search purchases by supplier or description..."
                                className={cn("input", styles.filterInput)}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <button 
                        className="btn btn-primary"
                        onClick={() => setModalOpen(true)}
                    >
                        <ShoppingCart size={18} />
                        <span>New Purchase</span>
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Supplier</th>
                                <th>Item / Description</th>
                                <th style={{ textAlign: 'right' }}>Total Amount</th>
                                <th style={{ textAlign: 'right' }}>Balance Due</th>
                                <th style={{ textAlign: 'center' }}>Payment Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPurchases.map((purchase) => {
                                const balance = Number(purchase.total_amount) - Number(purchase.paid_amount);
                                const isPaid = balance <= 0;
                                const isPartial = !isPaid && Number(purchase.paid_amount) > 0;
                                
                                return (
                                    <tr key={purchase.id}>
                                        <td className={cn(styles.textMuted, styles.textXs)}>
                                            <div className={cn(styles.flex, styles.itemsCenter, styles.gap1_5)}>
                                                <Calendar size={12} />
                                                {formatDate(purchase.created_at)}
                                            </div>
                                        </td>
                                        <td>
                                            <div className={cn(styles.fontSemibold, styles.textMain)}>{purchase.supplier_name}</div>
                                        </td>
                                        <td>
                                            <div className={styles.flexCol}>
                                                <span className={styles.fontMedium}>{purchase.description}</span>
                                                {purchase.purchase_type === 'raw_material' && (
                                                    <span className={cn(styles.textXs, styles.textMuted)}>
                                                        {purchase.quantity} {purchase.unit} @ {formatCurrency(purchase.rate)}/{purchase.unit}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }} className={cn(styles.fontMono, styles.fontBold)}>
                                            {formatCurrency(purchase.total_amount)}
                                        </td>
                                         <td style={{ textAlign: 'right' }} className={cn(styles.fontMono, styles.textError, styles.fontSemibold)}>
                                            {balance > 0 ? (
                                                <div className={cn(styles.flexCol, styles.itemsEnd)}>
                                                    <span>{formatCurrency(balance)}</span>
                                                    {purchase.due_date && (
                                                        <span className={cn(
                                                            styles.textSmallest, styles.fontMedium, styles.flex, styles.itemsCenter, styles.gap0_5,
                                                            new Date(purchase.due_date) < new Date().setHours(0,0,0,0) ? styles.textError : styles.textMuted
                                                        )}>
                                                            <CalendarDays size={10} />
                                                            Due: {formatDate(purchase.due_date)}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : '—'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={cn(
                                                "badge",
                                                isPaid ? "badge-success" : isPartial ? styles.partialBadge : "badge-error"
                                            )}>
                                                {isPaid ? (
                                                    <><CheckCircle2 size={12} className={styles.mr1} /> Fully Paid</>
                                                ) : isPartial ? (
                                                    <><AlertCircle size={12} className={styles.mr1} /> Partial</>
                                                ) : (
                                                    <><AlertCircle size={12} className={styles.mr1} /> Unpaid</>
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredPurchases.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="empty-state">
                                        <ShoppingCart size={40} className="mb-2" />
                                        <p>No purchase records found.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalOpen && (
                <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2 className={styles.h4}>Record New Purchase</h2>
                                <p className={cn(styles.textXs, styles.textMuted)}>Log material procurement or general company expenses</p>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="btn btn-outline">×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={cn("modal-body", styles.spaceY5)}>
                                <div className={cn(styles.formGroup, styles.colSpan2)}>
                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>
                                        <span className={cn(styles.flex, styles.itemsCenter, styles.gap2)}>
                                            <FactoryIcon size={14} />
                                            Factory for this purchase *
                                        </span>
                                    </label>
                                    <select
                                        className="select"
                                        value={formData.factory_id || effectiveFactoryId}
                                        onChange={(e) => {
                                            const fid = e.target.value;
                                            setFormData((prev) => ({
                                                ...prev,
                                                factory_id: fid,
                                                item_id: '',
                                                cap_id: '',
                                                description: prev.purchase_type === 'other' ? prev.description : '',
                                            }));
                                            setSelectedTemplateId('');
                                        }}
                                        required
                                    >
                                        {factories?.length ? (
                                            factories.map((f) => (
                                                <option key={f.id} value={f.id}>
                                                    {f.name}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="">No factories configured</option>
                                        )}
                                    </select>
                                    <p className={cn(styles.textSmallest, styles.textMuted, styles.mt05)}>
                                        Suppliers are not tied to one factory; pick the site this stock or expense belongs to. Raw materials and products listed below match this factory.
                                    </p>
                                </div>

                                <div className={styles.purchaseTypeToggle}>
                                    <button 
                                        type="button"
                                        className={cn(styles.toggleBtn, formData.purchase_type === 'raw_material' && styles.toggleActive)}
                                        onClick={() => setFormData({...formData, purchase_type: 'raw_material', description: '', item_id: '', unit_count: '', quantity: ''})}
                                    >
                                        <Database size={16} /> Raw Material
                                    </button>
                                    <button 
                                        type="button"
                                        className={cn(styles.toggleBtn, formData.purchase_type === 'finished_product' && styles.toggleActive)}
                                        onClick={() => setFormData({...formData, purchase_type: 'finished_product', description: '', item_id: '', unit_count: '', quantity: ''})}
                                    >
                                        <ShoppingCart size={16} /> Finished Product
                                    </button>
                                    <button 
                                        type="button"
                                        className={cn(styles.toggleBtn, formData.purchase_type === 'other' && styles.toggleActive)}
                                        onClick={() => setFormData({...formData, purchase_type: 'other', description: '', item_id: '', unit_count: '', quantity: ''})}
                                    >
                                        <Tag size={16} /> Other Expense
                                    </button>
                                </div>

                                <div className={cn(styles.grid, styles.gridCols2, styles.gap4)}>
                                    <div className={cn(styles.formGroup, styles.colSpan2)}>
                                        <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Select Supplier *</label>
                                        <select 
                                            className="select"
                                            name="supplier_id"
                                            value={formData.supplier_id}
                                            onChange={handleInputChange}
                                            required
                                        >
                                            <option value="">-- Choose a Supplier --</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} (Balance: {formatCurrency(s.balance_due)})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {formData.purchase_type === 'raw_material' ? (
                                        <div className={cn(styles.formGroup, styles.colSpan2)}>
                                            <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Material Item *</label>
                                            <select 
                                                className="select"
                                                name="item_id"
                                                value={formData.item_id}
                                                onChange={(e) => {
                                                    const item = rawMaterials.find(rm => rm.id === e.target.value);
                                                    setFormData({
                                                        ...formData, 
                                                        item_id: e.target.value,
                                                        description: item ? `Purchase of ${item.name}` : '',
                                                        unit: item ? item.unit : ''
                                                    });
                                                }}
                                                required
                                            >
                                                <option value="">-- Select Material --</option>
                                                {rawMaterials.map(rm => <option key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</option>)}
                                            </select>
                                        </div>
                                    ) : formData.purchase_type === 'finished_product' ? (
                                        <div className={cn(styles.formGroup, styles.colSpan2, styles.p4, styles.alertWarning, styles.spaceY4)} style={{ borderRadius: '1rem' }}>
                                            <div className={cn(styles.grid, styles.gridCols2, styles.gap4)}>
                                                <div>
                                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.fontBold)}>1. Select Template *</label>
                                                    <select 
                                                        className="select"
                                                        value={selectedTemplateId}
                                                        onChange={(e) => {
                                                            setSelectedTemplateId(e.target.value);
                                                            setFormData(prev => ({ ...prev, item_id: '', description: '' }));
                                                        }}
                                                        required={formData.purchase_type === 'finished_product'}
                                                    >
                                                        <option value="">-- Choose Template --</option>
                                                        {productTemplates.map(t => (
                                                            <option key={t.id} value={t.id}>{t.name} ({t.size})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.fontBold)}>2. Select Color/Variant *</label>
                                                    <select 
                                                        className="select"
                                                        name="item_id"
                                                        value={formData.item_id}
                                                        onChange={(e) => {
                                                            setFormData(prev => ({ ...prev, item_id: e.target.value }));
                                                        }}
                                                        disabled={!selectedTemplateId}
                                                        required={formData.purchase_type === 'finished_product'}
                                                    >
                                                        <option value="">-- Choose Color --</option>
                                                        {products
                                                            .filter(p => p.template_id === selectedTemplateId)
                                                            .map(p => (
                                                                <option key={p.id} value={p.id}>{p.color}</option>
                                                            ))
                                                        }
                                                    </select>
                                                    {!selectedTemplateId && <p className={cn(styles.textXs, styles.textMuted, styles.mt1)}>Please select a template first</p>}
                                                    {selectedTemplateId && products.filter(p => p.template_id === selectedTemplateId).length === 0 && (
                                                        <p className={cn(styles.textXs, styles.textDanger, styles.mt1)}>No variants found for this template</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={cn(styles.grid, styles.gridCols2, styles.gap4, styles.mt4)}>
                                                <div>
                                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.fontBold)}>Packaging Unit</label>
                                                    <select 
                                                        className="select"
                                                        name="packaging_unit"
                                                        value={formData.packaging_unit}
                                                        onChange={handleInputChange}
                                                    >
                                                        <option value="Loose">Loose (Semi-Finished)</option>
                                                        <option value="Packed">Packed (Packets)</option>
                                                        <option value="Bag">Bag (Finished)</option>
                                                        <option value="Bundle">Bundle (Finished)</option>
                                                        <option value="Box">Box (Finished)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.fontBold)}>Item Quantity ({formData.packaging_unit})</label>
                                                    <input
                                                        type="number"
                                                        name="unit_count"
                                                        placeholder="Enter count"
                                                        className="input"
                                                        value={formData.unit_count}
                                                        onChange={handleInputChange}
                                                        required={formData.purchase_type === 'finished_product'}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={cn(styles.formGroup, styles.colSpan2)}>
                                            <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Expense Description *</label>
                                            <input
                                                type="text"
                                                name="description"
                                                placeholder="e.g. Electricity Bill, Machinery Parts, Factory Repair"
                                                className="input"
                                                value={formData.description}
                                                onChange={handleInputChange}
                                                required
                                            />
                                        </div>
                                    )}

                                    {formData.purchase_type !== 'finished_product' && (
                                        <div className="form-group">
                                            <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>
                                                {formData.purchase_type === 'raw_material' ? 'Weight (kg)' : 'Quantity'}
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                name="quantity"
                                                placeholder="0.00"
                                                className="input"
                                                value={formData.quantity}
                                                onChange={handleInputChange}
                                                required={formData.purchase_type !== 'finished_product'}
                                            />
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>
                                            {formData.purchase_type === 'finished_product' ? `Rate per ${formData.packaging_unit}` : 'Rate per Unit'}
                                        </label>
                                        <div className={styles.relative}>
                                            <div className={cn(styles.absolute, styles.left3, styles.top1_2, styles.translateY1_2, styles.textMuted, styles.textSm)}>₹</div>
                                            <input
                                                type="number"
                                                step="0.01"
                                                name="rate"
                                                placeholder="0.00"
                                                className={cn("input", styles.pl10)}
                                                value={formData.rate}
                                                onChange={handleInputChange}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className={cn(styles.colSpan2, styles.calculationBanner)}>
                                        <div className={styles.calcItem}>
                                            <span className={styles.calcLabel}>Total Cost</span>
                                            <span className={styles.calcValue}>{formatCurrency(formData.total_amount)}</span>
                                        </div>
                                        <div className={styles.calcDivider} />
                                        <div className={styles.calcItem}>
                                            <label className={styles.calcLabel}>Amount Paid Now</label>
                                            <div className={cn(styles.relative, styles.mt05)}>
                                                <div className={cn(styles.absolute, styles.left3, styles.top1_2, styles.translateY1_2, styles.textPrimary, styles.textXs, styles.fontBold)}>₹</div>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    name="paid_amount"
                                                    className={styles.calcInput}
                                                    value={formData.paid_amount}
                                                    onChange={handleInputChange}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className={cn("form-group", styles.colSpan2)}>
                                        <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Payment Source</label>
                                        <select 
                                            className="select"
                                            name="payment_method"
                                            value={formData.payment_method}
                                            onChange={handleInputChange}
                                        >
                                            <option value="Cash">Cash Account</option>
                                            <option value="Bank Transfer">Bank Account</option>
                                            <option value="Cheque">Post-dated Cheque</option>
                                            <option value="Credit">Full Credit (Nil Payment)</option>
                                        </select>
                                    </div>

                                    {isCreditPurchase && (
                                        <div className={cn(styles.colSpan2, styles.alertBox, styles.alertWarning, styles.itemsCenter, styles.mt2)}>
                                            <div className={cn(styles.flex, styles.itemsCenter, styles.gap2)}>
                                                <AlertCircle size={16} />
                                                <span><strong>Credit Transaction:</strong> ₹{formatCurrency(balanceDue)} will be recorded as Balance Due to the supplier.</span>
                                            </div>
                                        </div>
                                    )}

                                    {isCreditPurchase && (
                                        <div className={cn("form-group", styles.colSpan2, styles.mt2)}>
                                            <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textAmber)}>
                                                <div className={cn(styles.flex, styles.itemsCenter, styles.gap2)}>
                                                    <CalendarDays size={14} />
                                                    Settlement Due Date *
                                                </div>
                                            </label>
                                            <input
                                                type="date"
                                                name="due_date"
                                                className="input"
                                                style={{ borderLeft: '3px solid var(--warning)' }}
                                                value={formData.due_date}
                                                onChange={handleInputChange}
                                                required={isCreditPurchase}
                                            />
                                            <p className={cn(styles.textSmallest, styles.textMuted, styles.mt05, styles.leadingTight)}>
                                                System will notify you 1 day before and on this date if the balance is not settled.
                                            </p>
                                        </div>
                                    )}

                                    <div className={cn("form-group", styles.colSpan2)}>
                                        <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Internal Notes</label>
                                        <textarea
                                            name="notes"
                                            className="textarea"
                                            rows="2"
                                            placeholder="Reference numbers, invoice details, etc."
                                            value={formData.notes}
                                            onChange={handleInputChange}
                                        ></textarea>
                                    </div>
                                </div>
                            </div>
                            <div className={cn("modal-footer", styles.pb6, styles.px6)}>
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={purchaseMutation.isPending}
                                    className={cn("btn btn-primary", styles.minW160)}
                                >
                                    {purchaseMutation.isPending ? (
                                        <Loader2 size={18} className={styles.animateSpin} />
                                    ) : (
                                        <ShoppingCart size={18} />
                                    )}
                                    Confirm Purchase
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
