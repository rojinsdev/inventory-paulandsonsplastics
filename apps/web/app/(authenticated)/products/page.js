'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Package, Loader2, X, RefreshCw } from 'lucide-react';
import { productsAPI, inventoryAPI, productTemplatesAPI, capsAPI, innersAPI } from '@/lib/api';
import { useFactory } from '@/contexts/FactoryContext';
import { useGuide } from '@/contexts/GuideContext';
import { formatCurrency, cn } from '@/lib/utils';
import { useUI } from '@/contexts/UIContext';
import toast from 'react-hot-toast';
import CustomSelect from '@/components/ui/CustomSelect';
import FactorySelect from '@/components/ui/FactorySelect';
import styles from './page.module.css';

const COLORS = [
    { value: 'White', label: 'White' },
    { value: 'Black', label: 'Black' },
    { value: 'Milky', label: 'Milky' },
    { value: 'Blue', label: 'Blue' },
    { value: 'Red', label: 'Red' },
    { value: 'Green', label: 'Green' },
    { value: 'Yellow', label: 'Yellow' },
    { value: 'Transparent', label: 'Transparent' },
];

export default function ProductsPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();

    const [modalOpen, setModalOpen] = useState(false);
    const [isTemplateMode, setIsTemplateMode] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        sku: '',
        size: '',
        color: 'White',
        colors: ['White'], // For template mode
        weight_grams: '',
        selling_price: '',
        status: 'active',
        factory_id: '',
        raw_material_id: '',
        cap_template_id: '',
        inner_template_id: '',
        packets_per_bag: '',
        items_per_bag: '',
        packets_per_box: '',
        items_per_box: '',
    });

    const [initialColors, setInitialColors] = useState([]);

    // Queries
    const { data: products = [], isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['products', selectedFactory],
        queryFn: () => {
            const params = selectedFactory ? { factory_id: selectedFactory } : {};
            return productsAPI.getAll(params).then(res => Array.isArray(res) ? res : []);
        },
    });
    const { data: templates = [] } = useQuery({
        queryKey: ['product-templates', selectedFactory],
        queryFn: () => {
            const params = selectedFactory ? { factory_id: selectedFactory } : {};
            return productTemplatesAPI.getAll(params).then(res => Array.isArray(res) ? res : []);
        },
    });

    const { data: capTemplates = [] } = useQuery({
        queryKey: ['cap-templates', selectedFactory],
        queryFn: () => {
            const params = selectedFactory ? { factory_id: selectedFactory } : {};
            return capsAPI.getTemplates(params).then(res => Array.isArray(res) ? res : []);
        },
    });

    const { data: innerTemplates = [] } = useQuery({
        queryKey: ['inner-templates', selectedFactory],
        queryFn: () => {
            const params = selectedFactory ? { factory_id: selectedFactory } : {};
            return innersAPI.getTemplates(params).then(res => Array.isArray(res) ? res : []);
        },
    });

    const error = queryError?.message;

    // Query for raw materials (factory-specific)
    const { data: rawMaterialsResponse, isLoading: rawMaterialsLoading } = useQuery({
        queryKey: ['rawMaterials', formData.factory_id],
        queryFn: async () => {
            if (!formData.factory_id) return { rawMaterials: [] };
            return await inventoryAPI.getRawMaterials({ factory_id: formData.factory_id });
        },
        enabled: modalOpen && !!formData.factory_id,
    });

    const rawMaterials = rawMaterialsResponse?.rawMaterials || (Array.isArray(rawMaterialsResponse) ? rawMaterialsResponse : []);

    // Mutations
    const saveMutation = useMutation({
        mutationFn: (data) => {
            if (isTemplateMode && editingProduct) {
                return productTemplatesAPI.update(editingProduct.id, data);
            }
            if (editingProduct) return productsAPI.update(editingProduct.id, data);
            if (isTemplateMode) return productTemplatesAPI.create(data);
            return productsAPI.create(data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['product-templates'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setModalOpen(false);
            const action = editingProduct ? 'updated' : 'created';
            const type = isTemplateMode ? 'Template' : 'Product';
            toast.success(`${type} ${action} successfully`);
        },
        onError: (err) => toast.error(err.message || 'Failed to save')
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => productsAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            toast.success('Product deleted successfully');
        },
        onError: (err) => toast.error(err.message || 'Failed to delete product')
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status }) => productsAPI.update(id, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            toast.success('Status updated');
        },
        onError: (err) => toast.error(err.message || 'Failed to update status')
    });

    const saving = saveMutation.isPending;


    // Load products
    useEffect(() => {
        setPageTitle('Products');
        registerGuide({
            title: "Product Management",
            description: "Central catalog for manufacturing specs, SKU tracking, and packing hierarchy.",
            logic: [
                {
                    title: "Specs (Weight & SKU)",
                    explanation: "The 'Weight (grams)' is critical for production math; it tells the system how much raw material to deduct per piece. 'SKU' is the unique code used to track this specific product version."
                },
                {
                    title: "Packing Hierarchy (Units)",
                    explanation: "Defines the bundle math: [Items] go into a [Packet], and [Packets] go into a [Bundle]. One 'Bundle' is the standard unit you sell and ship to customers."
                },
                {
                    title: "Price Management",
                    explanation: "The 'Selling Price' is your default rate per unit (piece). This is used for production value and cost recovery calculations."
                }
            ],
            components: [
                {
                    name: "Specs View",
                    description: "A comprehensive look at the physical attributes (size, color, weight) of each SKU."
                },
                {
                    name: "Packing Rules Editor",
                    description: "Fine-tune the items-per-bundle ratio for specific products to override system defaults."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);



    // Open modal for create
    const handleCreate = () => {
        setEditingProduct(null);
        setIsTemplateMode(false);
        setInitialColors([]);
        setFormData({
            name: '',
            sku: '',
            size: '',
            color: 'White',
            colors: ['White'],
            weight_grams: '',
            selling_price: '',
            items_per_packet: '100',
            packets_per_bundle: '50',
            items_per_bundle: '600',
            status: 'active',
            factory_id: selectedFactory || (factories.length === 1 ? factories[0].id : ''),
            raw_material_id: '',
            cap_template_id: '',
            inner_template_id: '',
            packets_per_bag: '',
            items_per_bag: '',
            packets_per_box: '',
            items_per_box: '',
            bundle_enabled: true,
            bag_enabled: false,
            box_enabled: false,
        });
        setModalOpen(true);
    };

    // Open modal for edit
    const handleEdit = (product) => {
        // If it's a template variant, edit the template
        if (product.template_id) {
            const template = templates.find(t => t.id === product.template_id);
            if (template) {
                setEditingProduct(template);
                setIsTemplateMode(true);
                const currentColors = template.variants?.map(v => v.color) || [];
                setInitialColors(currentColors);
                setFormData({
                    name: template.name || '',
                    sku: '', // Templates don't have individual SKUs
                    size: template.size || '',
                    color: '',
                    colors: currentColors,
                    weight_grams: template.weight_grams || '',
                    selling_price: template.selling_price || '',
                    items_per_packet: template.items_per_packet || '100',
                    packets_per_bundle: template.packets_per_bundle || '50',
                    items_per_bundle: template.items_per_bundle || '',
                    status: template.status || 'active',
                    factory_id: template.factory_id || '',
                    raw_material_id: template.raw_material_id || '',
                    cap_template_id: template.cap_template_id || '',
                    inner_template_id: template.inner_template_id || '',
                    packets_per_bag: template.packets_per_bag || '',
                    items_per_bag: template.items_per_bag || '',
                    packets_per_box: template.packets_per_box || '',
                    items_per_box: template.items_per_box || '',
                    bundle_enabled: template.bundle_enabled ?? true,
                    bag_enabled: template.bag_enabled ?? false,
                    box_enabled: template.box_enabled ?? false,
                });
                setModalOpen(true);
                return;
            }
        }

        // Single Product Edit
        setEditingProduct(product);
        setIsTemplateMode(false);
        setInitialColors([]);
        setFormData({
            name: product.name || '',
            sku: product.sku || '',
            size: product.size || '',
            color: product.color || 'White',
            colors: [product.color || 'White'],
            weight_grams: product.weight_grams || '',
            selling_price: product.selling_price || '',
            items_per_packet: product.items_per_packet || '100',
            packets_per_bundle: product.packets_per_bundle || '50',
            items_per_bundle: product.items_per_bundle || '',
            status: product.status || 'active',
            factory_id: product.factory_id || '',
            raw_material_id: product.raw_material_id || '',
            cap_template_id: product.cap_template_id || '',
            inner_template_id: product.inner_template_id || '',
            packets_per_bag: product.packets_per_bag || '',
            items_per_bag: product.items_per_bag || '',
            packets_per_box: product.packets_per_box || '',
            items_per_box: product.items_per_box || '',
            bundle_enabled: product.bundle_enabled ?? true,
            bag_enabled: product.bag_enabled ?? false,
            box_enabled: product.box_enabled ?? false,
        });
        setModalOpen(true);
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (isTemplateMode) {
            const payload = {
                name: formData.name,
                size: formData.size,
                weight_grams: Number(formData.weight_grams) || 0,
                items_per_packet: Number(formData.items_per_packet) || 0,
                packets_per_bundle: Number(formData.packets_per_bundle) || 0,
                items_per_bundle: formData.items_per_bundle ? Number(formData.items_per_bundle) : null,
                selling_price: formData.selling_price ? Number(formData.selling_price) : null,
                factory_id: formData.factory_id,
                raw_material_id: formData.raw_material_id || null,
                cap_template_id: formData.cap_template_id || null,
                inner_template_id: formData.inner_template_id || null,
                packets_per_bag: formData.packets_per_bag ? Number(formData.packets_per_bag) : null,
                items_per_bag: formData.items_per_bag ? Number(formData.items_per_bag) : null,
                packets_per_box: formData.packets_per_box ? Number(formData.packets_per_box) : null,
                items_per_box: formData.items_per_box ? Number(formData.items_per_box) : null,
                bundle_enabled: formData.bundle_enabled,
                bag_enabled: formData.bag_enabled,
                box_enabled: formData.box_enabled,
                colors: formData.colors,
            };

            // Calculate color diffs if editing
            if (editingProduct) {
                payload.variants_to_add = formData.colors.filter(c => !initialColors.includes(c));
                payload.variants_to_remove = initialColors.filter(c => !formData.colors.includes(c));
            }

            saveMutation.mutate(payload);
        } else {
            const payload = {
                ...formData,
                sku: formData.sku?.trim() || null,
                weight_grams: Number(formData.weight_grams) || 0,
                selling_price: formData.selling_price ? Number(formData.selling_price) : null,
                items_per_packet: Number(formData.items_per_packet) || 0,
                packets_per_bundle: Number(formData.packets_per_bundle) || 0,
                items_per_bundle: formData.items_per_bundle ? Number(formData.items_per_bundle) : null,
                raw_material_id: formData.raw_material_id || null,
                cap_template_id: formData.cap_template_id || null,
                inner_template_id: formData.inner_template_id || null,
                packets_per_bag: formData.packets_per_bag ? Number(formData.packets_per_bag) : null,
                items_per_bag: formData.items_per_bag ? Number(formData.items_per_bag) : null,
                packets_per_box: formData.packets_per_box ? Number(formData.packets_per_box) : null,
                items_per_box: formData.items_per_box ? Number(formData.items_per_box) : null,
                bundle_enabled: formData.bundle_enabled,
                bag_enabled: formData.bag_enabled,
                box_enabled: formData.box_enabled,
            };
            delete payload.colors;
            saveMutation.mutate(payload);
        }
    };

    // Handle delete
    const handleDelete = async (product) => {
        if (!confirm(`Delete product "${product.name}"?`)) return;
        deleteMutation.mutate(product.id);
    };

    // Toggle status
    const handleToggleStatus = async (product) => {
        statusMutation.mutate({
            id: product.id,
            status: product.status === 'active' ? 'inactive' : 'active',
        });
    };

    // Calculate stats
    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.status === 'active').length;

    // Validation Logic
    const isFormValid = () => {
        if (!formData.name || !formData.size || !formData.factory_id || !formData.weight_grams || !formData.raw_material_id) return false;
        
        // At least one packaging method must be enabled
        if (!formData.bundle_enabled && !formData.bag_enabled && !formData.box_enabled) return false;

        // Base requirement
        if (!formData.items_per_packet) return false;

        // Check specifics for enabled methods
        if (formData.bundle_enabled && !formData.packets_per_bundle) return false;
        if (formData.bag_enabled && !formData.packets_per_bag) return false;
        if (formData.box_enabled && !formData.packets_per_box) return false;

        if (isTemplateMode) {
            return formData.colors.length > 0;
        }

        return true;
    };

    return (
        <>
            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Products</h1>
                    <p className={styles.pageDescription}>
                        Manage product catalog and specifications
                    </p>
                </div>
                <button className={styles.primaryButton} onClick={handleCreate}>
                    <Plus size={18} />
                    <span>Add Product</span>
                </button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{totalProducts}</div>
                        <div className={styles.statLabel}>Total Products</div>
                        <div className={styles.statSublabel}>In catalog</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{activeProducts}</div>
                        <div className={styles.statLabel}>Active Products</div>
                        <div className={styles.statSublabel}>Currently available</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{templates.length}</div>
                        <div className={styles.statLabel}>Product Templates</div>
                        <div className={styles.statSublabel}>Master specs</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spinner} />
                        <span>Loading products...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <Package size={24} />
                        <p>{error}</p>
                        <button className={styles.retryButton} onClick={() => refetch()}>
                            <RefreshCw size={16} />
                            Retry
                        </button>
                    </div>
                ) : products.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Package size={48} />
                        <p>No products configured yet</p>
                        <p className={styles.emptyHint}>
                            Add your first product to start managing inventory
                        </p>
                        <button className={styles.primaryButton} onClick={handleCreate}>
                            <Plus size={18} />
                            <span>Add First Product</span>
                        </button>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>SKU</th>
                                    <th>Size</th>
                                    <th>Color</th>
                                    <th>Weight (g)</th>
                                    <th>Raw Material</th>
                                    <th>Items/Pkt</th>
                                    <th>Pkts/Bndl</th>
                                    <th>Items/Bndl</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => (
                                    <tr key={product.id}>
                                        <td className={styles.nameCell}>{product.name}</td>
                                        <td className={styles.skuCell}>{product.sku || '—'}</td>
                                        <td>{product.size}</td>
                                        <td>
                                            <span className={cn(styles.badge, styles[`badge${getColorBadge(product.color)}`])}>
                                                {product.color}
                                            </span>
                                        </td>
                                        <td className={styles.weightCell}>{product.weight_grams}</td>
                                        <td>{product.raw_materials?.name || '—'}</td>
                                        <td>{product.items_per_packet}</td>
                                        <td>{product.packets_per_bundle}</td>
                                        <td>{product.items_per_bundle || '—'}</td>
                                        <td>
                                            <button
                                                className={cn(styles.toggle, product.status === 'active' && styles.toggleActive)}
                                                onClick={() => handleToggleStatus(product)}
                                                title={product.status === 'active' ? 'Deactivate' : 'Activate'}
                                            />
                                        </td>
                                        <td>
                                            <div className={styles.actions}>
                                                <button
                                                    className={styles.actionButton}
                                                    onClick={() => handleEdit(product)}
                                                    title="Edit"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    className={styles.actionButton}
                                                    onClick={() => handleDelete(product)}
                                                    title="Delete"
                                                >
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

            {/* Modal */}
            {modalOpen && (
                <div className={styles.modalBackdrop} onClick={() => setModalOpen(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                {editingProduct ? 'Edit Product' : isTemplateMode ? 'Add Product Template' : 'Add Single Product'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.modalContent}>
                            {!editingProduct && (
                                <div className={styles.modeToggleWrapper}>
                                    <div className={styles.modeToggle}>
                                        <button
                                            type="button"
                                            className={cn(styles.modeBtn, !isTemplateMode && styles.modeBtnActive)}
                                            onClick={() => setIsTemplateMode(false)}
                                        >
                                            Single SKU
                                        </button>
                                        <button
                                            type="button"
                                            className={cn(styles.modeBtn, isTemplateMode && styles.modeBtnActive)}
                                            onClick={() => setIsTemplateMode(true)}
                                        >
                                            Template (Multiple Colors)
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className={styles.modalBody}>
                                <div className={styles.landscapeLayout}>
                                    {/* Left Pane: Definition & Manufacturing */}
                                    <div className={styles.leftPane}>
                                        <div className={styles.formSection}>
                                            <h3 className={styles.sectionTitle}>
                                                <Package size={16} />
                                                Basic Information
                                            </h3>
                                            <div className={styles.formRow}>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Product Name *</label>
                                                    <input
                                                        type="text"
                                                        className={styles.formInput}
                                                        value={formData.name}
                                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                        required
                                                        placeholder="e.g., Industrial Crate XL"
                                                    />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Factory *</label>
                                                    <FactorySelect
                                                        value={formData.factory_id}
                                                        onChange={(val) => {
                                                            setFormData({
                                                                ...formData,
                                                                factory_id: val,
                                                                raw_material_id: ''
                                                            });
                                                        }}
                                                        disabled={!!editingProduct}
                                                    />
                                                </div>
                                            </div>

                                            <div className={styles.formRow}>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Size / Master Specs *</label>
                                                    <input
                                                        type="text"
                                                        className={styles.formInput}
                                                        value={formData.size}
                                                        onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                                                        required
                                                        placeholder="e.g., 600x400x300, 100ml"
                                                    />
                                                </div>
                                                {!isTemplateMode ? (
                                                    <div className={styles.formGroup}>
                                                        <label className={styles.formLabel}>SKU (Optional)</label>
                                                        <input
                                                            type="text"
                                                            className={styles.formInput}
                                                            value={formData.sku}
                                                            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                                            placeholder="Unique Code"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className={styles.formGroup}>
                                                        <label className={styles.formLabel}>Status</label>
                                                        <CustomSelect
                                                            options={[
                                                                { value: 'active', label: 'Active' },
                                                                { value: 'inactive', label: 'Inactive' }
                                                            ]}
                                                            value={formData.status}
                                                            onChange={(val) => setFormData({ ...formData, status: val })}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {isTemplateMode && (
                                                <>
                                                    <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                                                        <label className={styles.formLabel}>Default Cap Template (Optional)</label>
                                                        <CustomSelect
                                                            options={[
                                                                { value: '', label: 'No Cap Mapping' },
                                                                ...capTemplates.map(ct => ({ value: ct.id, label: ct.name }))
                                                            ]}
                                                            value={formData.cap_template_id}
                                                            onChange={(val) => setFormData({ ...formData, cap_template_id: val })}
                                                            placeholder="Select cap template"
                                                        />
                                                        <p className={styles.inputHint}>
                                                            Automatically deducts matching cap variants during production.
                                                        </p>
                                                    </div>

                                                    <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                                                        <label className={styles.formLabel}>Default Inner Template (Optional)</label>
                                                        <CustomSelect
                                                            options={[
                                                                { value: '', label: 'No Inner Mapping' },
                                                                ...innerTemplates.map(it => ({ value: it.id, label: it.name }))
                                                            ]}
                                                            value={formData.inner_template_id}
                                                            onChange={(val) => setFormData({ ...formData, inner_template_id: val })}
                                                            placeholder="Select inner template"
                                                        />
                                                        <p className={styles.inputHint}>
                                                            Automatically deducts inners when products are packed.
                                                        </p>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className={styles.formSection}>
                                            <h3 className={styles.sectionTitle}>
                                                <RefreshCw size={16} />
                                                Manufacturing & Pricing
                                            </h3>
                                            <div className={styles.formRow}>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Weight per Unit *</label>
                                                    <div className={styles.inputWrapper}>
                                                        <input
                                                            type="number"
                                                            className={styles.formInput}
                                                            value={formData.weight_grams ?? ''}
                                                            onChange={(e) => setFormData({ ...formData, weight_grams: e.target.value === '' ? '' : e.target.value })}
                                                            required
                                                            min="0"
                                                            step="0.01"
                                                            placeholder="0.00"
                                                        />
                                                        <span className={styles.suffix}>grams</span>
                                                    </div>
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Raw Material *</label>
                                                    <CustomSelect
                                                        options={rawMaterials.map(rm => ({ value: rm.id, label: rm.name }))}
                                                        value={formData.raw_material_id}
                                                        onChange={(val) => setFormData({ ...formData, raw_material_id: val })}
                                                        placeholder={formData.factory_id ? "Select material" : "Select factory first"}
                                                        disabled={!formData.factory_id || rawMaterialsLoading}
                                                    />
                                                </div>
                                            </div>
                                            <div className={styles.formRow}>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Selling Price (Optional)</label>
                                                    <div className={styles.prefixWrapper}>
                                                        <input
                                                            type="number"
                                                            className={styles.formInput}
                                                            value={formData.selling_price ?? ''}
                                                            onChange={(e) => setFormData({ ...formData, selling_price: e.target.value === '' ? '' : e.target.value })}
                                                            placeholder="0.80"
                                                            min="0"
                                                            step="0.01"
                                                        />
                                                    </div>
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>Status</label>
                                                    <CustomSelect
                                                        options={[
                                                            { value: 'active', label: 'Active' },
                                                            { value: 'inactive', label: 'Inactive' }
                                                        ]}
                                                        value={formData.status}
                                                        onChange={(val) => setFormData({ ...formData, status: val })}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                    </div>

                                    {/* Right Pane: Colors & Logistics */}
                                    <div className={styles.rightPane}>
                                        <div className={styles.formSection}>
                                            <h3 className={styles.sectionTitle}>
                                                <Package size={16} />
                                                Packing Configuration
                                            </h3>

                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Items per Packet *</label>
                                                <input
                                                    type="number"
                                                    className={styles.formInput}
                                                    value={formData.items_per_packet}
                                                    onChange={(e) => setFormData({ ...formData, items_per_packet: e.target.value })}
                                                    required
                                                    min="1"
                                                />
                                            </div>

                                            {/* Bundle Section */}
                                            <div className={styles.packagingToggleRow}>
                                                <span className={styles.toggleLabel}>Enable Bundle</span>
                                                <div 
                                                    className={`${styles.toggle} ${formData.bundle_enabled ? styles.toggleActive : ''}`}
                                                    onClick={() => setFormData({ ...formData, bundle_enabled: !formData.bundle_enabled })}
                                                />
                                            </div>
                                            {formData.bundle_enabled && (
                                                <div className={styles.formRow} style={{ marginBottom: '1.5rem', animation: 'fadeIn 0.2s ease-out' }}>
                                                    <div className={styles.formGroup}>
                                                        <label className={styles.formLabel}>Packets per Bundle *</label>
                                                        <input
                                                            type="number"
                                                            className={styles.formInput}
                                                            value={formData.packets_per_bundle}
                                                            onChange={(e) => setFormData({ ...formData, packets_per_bundle: e.target.value })}
                                                            required
                                                            min="1"
                                                        />
                                                        <div className={styles.inputHint}>Total: {Number(formData.items_per_packet || 0) * Number(formData.packets_per_bundle || 0)} items</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Bag Section */}
                                            <div className={styles.packagingToggleRow}>
                                                <span className={styles.toggleLabel}>Enable Bag</span>
                                                <div 
                                                    className={`${styles.toggle} ${formData.bag_enabled ? styles.toggleActive : ''}`}
                                                    onClick={() => setFormData({ ...formData, bag_enabled: !formData.bag_enabled })}
                                                />
                                            </div>
                                            {formData.bag_enabled && (
                                                <div className={styles.formRow} style={{ marginBottom: '1.5rem', animation: 'fadeIn 0.2s ease-out' }}>
                                                    <div className={styles.formGroup}>
                                                        <label className={styles.formLabel}>Packets per Bag *</label>
                                                        <input
                                                            type="number"
                                                            className={styles.formInput}
                                                            value={formData.packets_per_bag}
                                                            onChange={(e) => setFormData({ ...formData, packets_per_bag: e.target.value })}
                                                            required
                                                            min="1"
                                                        />
                                                        <div className={styles.inputHint}>Total: {Number(formData.items_per_packet || 0) * Number(formData.packets_per_bag || 0)} items</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Box Section */}
                                            <div className={styles.packagingToggleRow}>
                                                <span className={styles.toggleLabel}>Enable Box</span>
                                                <div 
                                                    className={`${styles.toggle} ${formData.box_enabled ? styles.toggleActive : ''}`}
                                                    onClick={() => setFormData({ ...formData, box_enabled: !formData.box_enabled })}
                                                />
                                            </div>
                                            {formData.box_enabled && (
                                                <div className={styles.formRow} style={{ animation: 'fadeIn 0.2s ease-out' }}>
                                                    <div className={styles.formGroup}>
                                                        <label className={styles.formLabel}>Packets per Box *</label>
                                                        <input
                                                            type="number"
                                                            className={styles.formInput}
                                                            value={formData.packets_per_box}
                                                            onChange={(e) => setFormData({ ...formData, packets_per_box: e.target.value })}
                                                            required
                                                            min="1"
                                                        />
                                                        <div className={styles.inputHint}>Total: {Number(formData.items_per_packet || 0) * Number(formData.packets_per_box || 0)} items</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className={styles.formSection}>
                                            <h3 className={styles.sectionTitle}>
                                                <Plus size={16} />
                                                {isTemplateMode ? 'Target Variants (Colors)' : 'Color Selection'}
                                            </h3>
                                            {isTemplateMode ? (
                                                <div className={styles.colorTagSection}>
                                                    <div className={styles.tagContainer}>
                                                        {formData.colors.length === 0 && (
                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                Select at least one color below...
                                                            </span>
                                                        )}
                                                        {formData.colors.map(col => (
                                                            <div key={col} className={styles.colorTag}>
                                                                <span>{col}</span>
                                                                <button
                                                                    type="button"
                                                                    className={styles.removeTagBtn}
                                                                    onClick={() => {
                                                                        setFormData({
                                                                            ...formData,
                                                                            colors: formData.colors.filter(c => c !== col)
                                                                        });
                                                                    }}
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className={styles.availableColors}>
                                                        {COLORS.map(c => (
                                                            <button
                                                                key={c.value}
                                                                type="button"
                                                                className={cn(
                                                                    styles.colorChoiceBtn,
                                                                    formData.colors.includes(c.value) && styles.colorChoiceBtnSelected
                                                                )}
                                                                onClick={() => {
                                                                    if (!formData.colors.includes(c.value)) {
                                                                        setFormData({
                                                                            ...formData,
                                                                            colors: [...formData.colors, c.value]
                                                                        });
                                                                    }
                                                                }}
                                                                disabled={formData.colors.includes(c.value)}
                                                            >
                                                                {c.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={styles.formGroup}>
                                                    <CustomSelect
                                                        options={COLORS}
                                                        value={formData.color}
                                                        onChange={(val) => setFormData({ ...formData, color: val })}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() => setModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={saving || !isFormValid()}
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 size={16} className={styles.spinner} />
                                            <span>Saving...</span>
                                        </>
                                    ) : editingProduct ? (
                                        'Update Product'
                                    ) : (
                                        'Create Product'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

// Helper to get badge style for color
function getColorBadge(color) {
    const colorMap = {
        White: 'Gray',
        Black: 'Gray',
        Milky: 'Gray',
        Blue: 'Primary',
        Red: 'Error',
        Green: 'Success',
        Yellow: 'Warning',
        Transparent: 'Gray',
    };
    return colorMap[color] || 'Gray';
}
