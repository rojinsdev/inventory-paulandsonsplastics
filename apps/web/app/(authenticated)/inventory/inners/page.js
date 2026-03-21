'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import {
    Loader2, Plus, Search, Filter, Trash2, Edit2,
    Check, X, HardHat, Package, Factory,
    Clock, Weight, Info, Settings,
    TrendingUp, ArrowUpRight, AlertTriangle, Layers
} from 'lucide-react';
import { innersAPI, productTemplatesAPI, inventoryAPI, machinesAPI } from '@/lib/api';
import { formatNumber, cn } from '@/lib/utils';
import { useFactory } from '@/contexts/FactoryContext';
import { useGuide } from '@/contexts/GuideContext';
import FactorySelect from '@/components/ui/FactorySelect';
import toast from 'react-hot-toast';
import styles from './page.module.css';

export default function InnerManagementPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInner, setSelectedInner] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [colorFilter, setColorFilter] = useState('All');
    const [weightFilter, setWeightFilter] = useState('All');
    const [mappedOnly, setMappedOnly] = useState(false);
    const [deleteConfirmInner, setDeleteConfirmInner] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        colors: [],
        ideal_weight_grams: '',
        ideal_cycle_time_seconds: '',
        factory_id: '',
        machine_id: '',
        raw_material_id: '',
        product_template_ids: []
    });

    const [productSearch, setProductSearch] = useState('');

    // Fetch Product Templates for mapping
    const { data: productTemplatesRes, isLoading: loadingProducts } = useQuery({
        queryKey: ['product-templates', formData.factory_id],
        queryFn: () => productTemplatesAPI.getAll(formData.factory_id ? { factory_id: formData.factory_id } : {}),
        enabled: !!formData.factory_id && isModalOpen,
    });
    const productTemplates = useMemo(() => productTemplatesRes?.data || (Array.isArray(productTemplatesRes) ? productTemplatesRes : []), [productTemplatesRes]);

    // Fetch Raw Materials for assignment (filtered by factory)
    const { data: rawMaterialsRes, isLoading: loadingRawMaterials } = useQuery({
        queryKey: ['raw-materials', formData.factory_id],
        queryFn: () => inventoryAPI.getRawMaterials({ factory_id: formData.factory_id }),
        enabled: !!formData.factory_id && isModalOpen,
    });
    const rawMaterials = useMemo(() => rawMaterialsRes?.rawMaterials || (Array.isArray(rawMaterialsRes) ? rawMaterialsRes : []), [rawMaterialsRes]);

    // Fetch Machines for assignment (filtered by factory)
    const { data: machinesRes, isLoading: loadingMachines } = useQuery({
        queryKey: ['machines', formData.factory_id],
        queryFn: () => machinesAPI.getAll({ factory_id: formData.factory_id }),
        enabled: !!formData.factory_id && isModalOpen,
    });
    const machines = useMemo(() => machinesRes?.data || (Array.isArray(machinesRes) ? machinesRes : []), [machinesRes]);

    // Fetch Inner Templates
    const { data: innersRes, isLoading: loadingInners, error: innersError } = useQuery({
        queryKey: ['inner-templates', selectedFactory],
        queryFn: () => innersAPI.getTemplates(selectedFactory ? { factory_id: selectedFactory } : {}),
    });
    const inners = useMemo(() => innersRes?.data || (Array.isArray(innersRes) ? innersRes : []), [innersRes]);

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data) => innersAPI.createTemplate(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['inner-templates']);
            toast.success('Inner template created successfully');
            closeModal();
        },
        onError: (err) => toast.error(err.message || 'Failed to create inner template')
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => innersAPI.updateTemplate(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['inner-templates']);
            toast.success('Inner template updated successfully');
            closeModal();
        },
        onError: (err) => toast.error(err.message || 'Failed to update inner template')
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => innersAPI.deleteTemplate(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['inner-templates']);
            toast.success('Inner template deleted successfully');
        },
        onError: (err) => toast.error(err.message || 'Failed to delete inner template')
    });

    const isSaving = createMutation.isPending || updateMutation.isPending;

    useEffect(() => {
        setPageTitle('Inner Management');
        registerGuide({
            title: 'Inner Management',
            description: 'Define and map inners (placed under caps). Inners are tracked separately for production and stock.',
            logic: [
                {
                    title: 'Direct Production Mapping',
                    explanation: 'Inners are produced as separate items. Mapping them to products allows automatic stock deduction when a product is packed.'
                },
                {
                    title: 'Weight-Based Inventory',
                    explanation: 'Inners, like products, are managed by total weight. The system translates weight to unit counts for easier inventory tracking.'
                }
            ],
            components: [
                { name: 'Inner Templates', description: 'Master data for different types of inners.' },
                { name: 'Mapping Tool', description: 'Associate inners with product templates for synchronous stock movement.' }
            ]
        });
    }, [registerGuide, setPageTitle]);

    const filteredInners = useMemo(() => {
        let results = inners;

        if (searchTerm) {
            const query = searchTerm.toLowerCase();
            results = results.filter(i =>
                i.name.toLowerCase().includes(query) ||
                (i.variants?.some(v => v.color.toLowerCase().includes(query)))
            );
        }

        if (colorFilter !== 'All') {
            results = results.filter(i =>
                i.variants?.some(v => v.color === colorFilter)
            );
        }

        if (weightFilter !== 'All') {
            results = results.filter(i => {
                const w = parseFloat(i.ideal_weight_grams);
                if (weightFilter === 'Light') return w < 0.5;
                if (weightFilter === 'Standard') return w >= 0.5 && w <= 2;
                if (weightFilter === 'Heavy') return w > 2;
                return true;
            });
        }

        if (mappedOnly) {
            results = results.filter(i => (i.mapped_product_templates?.length || 0) > 0);
        }

        return results;
    }, [inners, searchTerm, colorFilter, weightFilter, mappedOnly]);

    const openModal = (inner = null) => {
        setProductSearch('');
        if (inner) {
            setSelectedInner(inner);
            setFormData({
                name: inner.name,
                colors: inner.variants?.map(v => v.color) || [],
                ideal_weight_grams: inner.ideal_weight_grams || '',
                ideal_cycle_time_seconds: inner.ideal_cycle_time_seconds || '',
                factory_id: inner.factory_id || '',
                machine_id: inner.machine_id || '',
                raw_material_id: inner.raw_material_id || '',
                product_template_ids: inner.mapped_product_templates?.map(c => c.id) || []
            });
        } else {
            setSelectedInner(null);
            setFormData({
                name: '',
                colors: ['Transparent'],
                ideal_weight_grams: '',
                ideal_cycle_time_seconds: '',
                factory_id: selectedFactory || (factories.length === 1 ? factories[0].id : ''),
                machine_id: '',
                raw_material_id: '',
                product_template_ids: []
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedInner(null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const payload = {
            ...formData,
            ideal_weight_grams: parseFloat(formData.ideal_weight_grams),
            ideal_cycle_time_seconds: parseFloat(formData.ideal_cycle_time_seconds) || 0,
            machine_id: formData.machine_id || null,
            raw_material_id: formData.raw_material_id || null
        };

        if (selectedInner) {
            updateMutation.mutate({ id: selectedInner.id, data: payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const toggleProductMapping = (templateId) => {
        setFormData(prev => {
            const isMapped = prev.product_template_ids.includes(templateId);
            if (isMapped) {
                return { ...prev, product_template_ids: prev.product_template_ids.filter(id => id !== templateId) };
            } else {
                return { ...prev, product_template_ids: [...prev.product_template_ids, templateId] };
            }
        });
    };

    const handleDelete = (inner) => {
        setDeleteConfirmInner(inner);
    };

    const confirmDelete = () => {
        if (deleteConfirmInner) {
            deleteMutation.mutate(deleteConfirmInner.id);
            setDeleteConfirmInner(null);
        }
    };

    const totalInners = inners.length;
    const mappedCount = inners.reduce((acc, i) => acc + (i.mapped_product_templates?.length || 0), 0);

    const isFormValid = useMemo(() => {
        return (
            formData.name.trim() !== '' &&
            formData.factory_id !== '' &&
            parseFloat(formData.ideal_weight_grams) > 0
        );
    }, [formData]);

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Inner Templates</h1>
                    <p className={styles.pageDescription}>Manage inner liners placed under caps.</p>

                    <div className={styles.metricChipsRow}>
                        <div
                            className={cn(styles.metricChip, !mappedOnly && styles.metricChipActive)}
                            onClick={() => setMappedOnly(false)}
                        >
                            <span className={styles.chipValue}>{totalInners}</span>
                            <span className={styles.chipLabel}>Total Templates</span>
                        </div>

                        <div
                            className={cn(styles.metricChip, mappedOnly && styles.metricChipActive)}
                            onClick={() => setMappedOnly(true)}
                        >
                            <span className={styles.chipValue}>{mappedCount}</span>
                            <span className={styles.chipLabel}>Mapped to Products</span>
                        </div>

                        <div className={styles.metricChip}>
                            <span className={styles.chipValue}>0.8g</span>
                            <span className={styles.chipLabel}>Standard Weight</span>
                            <Weight size={12} className={styles.trendingIcon} />
                        </div>
                    </div>
                </div>
                <button className={styles.primaryButton} onClick={() => openModal()}>
                    <Plus size={20} style={{ marginRight: '8px' }} />
                    Define New Inner
                </button>
            </div>

            <div className={styles.filterBar}>
                <div className={styles.filterRow}>
                    <div className={styles.searchBox} style={{ flex: 1 }}>
                        <Search className={styles.filterIcon} size={18} />
                        <input
                            type="text"
                            className={styles.filterInput}
                            placeholder="Search by inner name..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className={styles.tableContainer}>
                {loadingInners ? (
                    <div className={styles.loading}>
                        <Loader2 className={styles.spinner} size={32} />
                        <p>Loading templates...</p>
                    </div>
                ) : innersError ? (
                    <div className={styles.error}>
                        <p>Error loading inners: {innersError.message}</p>
                    </div>
                ) : filteredInners.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Package size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <p>No inner templates found.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Inner Variant</th>
                                    <th>Specifications</th>
                                    <th>Consumption</th>
                                    <th>Mapped Product Templates</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInners.map(inner => (
                                    <tr key={inner.id}>
                                        <td>
                                            <div className={styles.nameCell}>{inner.name}</div>
                                            <div className={styles.badgeGray} style={{ fontSize: '0.7rem', display: 'inline-block', marginTop: '4px' }}>
                                                {inner.variants?.length || 0} Colors
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '16px' }}>
                                                <div className={styles.specItem}>
                                                    <Weight size={14} className={styles.textMuted} />
                                                    <span className={styles.specValue}>
                                                        {inner.ideal_weight_grams}g
                                                    </span>
                                                </div>
                                                <div className={styles.specItem}>
                                                    <Clock size={14} className={styles.textMuted} />
                                                    <span className={styles.specValue}>
                                                        {parseFloat(inner.ideal_cycle_time_seconds) || 0}s
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.85rem' }}>
                                                {inner.raw_material?.name || (
                                                    <span className={styles.textMuted}>Direct Entry</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className={styles.mappingTags}>
                                                {inner.mapped_product_templates?.length > 0 ? (
                                                    <>
                                                        {inner.mapped_product_templates.slice(0, 3).map(c => (
                                                            <span key={c.id} className={styles.tagBadge}>
                                                                {c.name}
                                                            </span>
                                                        ))}
                                                        {inner.mapped_product_templates.length > 3 && (
                                                            <span className={styles.moreBadge}>
                                                                +{inner.mapped_product_templates.length - 3} more
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className={styles.noMappings}>No mappings</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button className={styles.actionButton} onClick={() => openModal(inner)}>
                                                    <Edit2 size={16} />
                                                </button>
                                                <button className={cn(styles.actionButton)} style={{ color: 'var(--error-text)' }} onClick={() => handleDelete(inner)}>
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

            {isModalOpen && (
                <div className={styles.modalBackdrop} onClick={closeModal}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{selectedInner ? 'Edit Inner Details' : 'Define New Inner'}</h2>
                            <button className={styles.closeBtn} onClick={closeModal}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
                            <div className={styles.modalBody}>
                                <div className={styles.landscapeLayout}>
                                    <div className={styles.leftPane}>
                                        <div className={styles.formSection}>
                                            <h3 className={styles.sectionTitle}>
                                                <Layers size={16} /> Basic Identity
                                            </h3>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Inner Name *</label>
                                                <input
                                                    type="text"
                                                    className={styles.formInput}
                                                    placeholder="e.g. 28mm Adhesive Inner"
                                                    value={formData.name}
                                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                    required
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Colors (Click to remove, enter to add)</label>
                                                <div className={styles.colorsGrid}>
                                                    {(formData.colors || []).map(color => (
                                                        <div key={color} className={styles.colorTag}>
                                                            {color}
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData({ ...formData, colors: formData.colors.filter(c => c !== color) })}
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <input
                                                        type="text"
                                                        className={styles.colorInput}
                                                        placeholder="Add color..."
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                const val = e.target.value.trim();
                                                                if (val && !formData.colors.includes(val)) {
                                                                    setFormData({ ...formData, colors: [...formData.colors, val] });
                                                                    e.target.value = '';
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Select Factory *</label>
                                                <FactorySelect
                                                    value={formData.factory_id}
                                                    onChange={val => setFormData({ ...formData, factory_id: val, machine_id: '', product_template_ids: [] })}
                                                    disabled={!!selectedInner}
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Associated Machine</label>
                                                <select
                                                    className={styles.formInput}
                                                    value={formData.machine_id || ''}
                                                    onChange={e => setFormData({ ...formData, machine_id: e.target.value })}
                                                    disabled={loadingMachines || !formData.factory_id}
                                                >
                                                    <option value="">
                                                        {!formData.factory_id
                                                            ? 'Select Factory First'
                                                            : loadingMachines
                                                                ? 'Loading...'
                                                                : machines.length === 0
                                                                    ? 'No Machines Found'
                                                                    : '-- Select Machine (Optional) --'}
                                                    </option>
                                                    {machines.map(m => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className={styles.formSection}>
                                            <h3 className={styles.sectionTitle}>
                                                <Clock size={16} /> Physical Specifications
                                            </h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Ideal Weight *</label>
                                                    <div className={styles.inputWrapper}>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className={styles.formInput}
                                                            value={formData.ideal_weight_grams}
                                                            onChange={e => setFormData({ ...formData, ideal_weight_grams: e.target.value })}
                                                            required
                                                        />
                                                        <span className={styles.suffix}>grams</span>
                                                    </div>
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Cycle Time</label>
                                                    <div className={styles.inputWrapper}>
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            className={styles.formInput}
                                                            value={formData.ideal_cycle_time_seconds}
                                                            onChange={e => setFormData({ ...formData, ideal_cycle_time_seconds: e.target.value })}
                                                        />
                                                        <span className={styles.suffix}>seconds</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className={styles.formSection} style={{ marginBottom: 0 }}>
                                            <h3 className={styles.sectionTitle}>
                                                <Settings size={16} /> Raw Material Deduction
                                            </h3>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Associated Material</label>
                                                <select
                                                    className={styles.formInput}
                                                    value={formData.raw_material_id || ''}
                                                    onChange={e => setFormData({ ...formData, raw_material_id: e.target.value })}
                                                    disabled={loadingRawMaterials || !formData.factory_id}
                                                >
                                                    <option value="">
                                                        {!formData.factory_id
                                                            ? 'Select Factory First'
                                                            : loadingRawMaterials
                                                                ? 'Loading...'
                                                                : rawMaterials.length === 0
                                                                    ? 'No Raw Materials Found'
                                                                    : '-- Select Raw Material (Optional) --'}
                                                    </option>
                                                    {rawMaterials.map(rm => (
                                                        <option key={rm.id} value={rm.id}>
                                                            {rm.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.rightPane}>
                                        <h3 className={styles.sectionTitle}>
                                            <Package size={16} /> Mapped Product Templates
                                        </h3>
                                        <p className={styles.pageDescription} style={{ fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                                            Select all product templates that use this inner.
                                        </p>

                                        <div className={styles.tagContainer}>
                                            {formData.product_template_ids.length > 0 ? (
                                                formData.product_template_ids.map(templateId => {
                                                    const template = productTemplates?.find(c => c.id === templateId);
                                                    return (
                                                        <div key={templateId} className={styles.itemTag}>
                                                            {template ? template.name : 'Unknown Product'}
                                                            <button
                                                                type="button"
                                                                className={styles.removeTagBtn}
                                                                onClick={() => toggleProductMapping(templateId)}
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <span className={styles.textMuted} style={{ fontSize: '0.8rem', padding: '0.25rem' }}>
                                                    No products mapped yet.
                                                </span>
                                            )}
                                        </div>

                                        <div className={styles.availableItems}>
                                            <div className={styles.searchBox}>
                                                <Search className={styles.filterIcon} size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                                <input
                                                    type="text"
                                                    className={styles.filterInput}
                                                    placeholder="Search product templates..."
                                                    style={{ paddingLeft: '32px', fontSize: '0.8rem' }}
                                                    value={productSearch}
                                                    onChange={e => setProductSearch(e.target.value)}
                                                />
                                            </div>

                                            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {loadingProducts ? (
                                                    <div style={{ padding: '1rem', textAlign: 'center' }}>
                                                        <Loader2 className={styles.spinner} size={16} />
                                                    </div>
                                                ) : !formData.factory_id ? (
                                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                        <Factory size={32} style={{ marginBottom: '1rem', opacity: 0.1 }} />
                                                        <p style={{ fontSize: '0.8rem' }}>Please select a factory to see products.</p>
                                                    </div>
                                                ) : (productTemplates || []).length === 0 ? (
                                                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                        No product templates found for this factory.
                                                    </div>
                                                ) : (
                                                    productTemplates
                                                        .filter(c => !productSearch || c.name.toLowerCase().includes(productSearch.toLowerCase()))
                                                        .map(template => {
                                                            const isSelected = formData.product_template_ids.includes(template.id);
                                                            return (
                                                                <button
                                                                    key={template.id}
                                                                    type="button"
                                                                    className={cn(styles.itemChoiceBtn, isSelected && styles.itemChoiceBtnSelected)}
                                                                    disabled={isSelected}
                                                                    onClick={() => toggleProductMapping(template.id)}
                                                                >
                                                                    <div>
                                                                        <div style={{ fontWeight: 500 }}>{template.name}</div>
                                                                    </div>
                                                                    {!isSelected && <Plus size={14} style={{ opacity: 0.5 }} />}
                                                                </button>
                                                            );
                                                        })
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.secondaryButton} onClick={closeModal}>Cancel</button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={isSaving || !isFormValid}
                                >
                                    {isSaving ? 'Saving...' : (selectedInner ? 'Save Changes' : 'Create Inner')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteConfirmInner && (
                <div className={styles.modalBackdrop} onClick={() => setDeleteConfirmInner(null)}>
                    <div className={styles.modal} style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '2rem', textAlign: 'center' }}>
                            <AlertTriangle size={48} style={{ color: 'var(--error-text)', marginBottom: '1rem' }} />
                            <h3 style={{ marginBottom: '1rem' }}>Confirm Deletion</h3>
                            <p>Are you sure you want to delete <strong>{deleteConfirmInner.name}</strong>?</p>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'center' }}>
                                <button className={styles.secondaryButton} onClick={() => setDeleteConfirmInner(null)}>Cancel</button>
                                <button
                                    className={styles.primaryButton}
                                    style={{ backgroundColor: 'var(--error-text)' }}
                                    onClick={confirmDelete}
                                    disabled={deleteMutation.isPending}
                                >
                                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
