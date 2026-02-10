'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Package, Loader2, X, RefreshCw } from 'lucide-react';
import { productsAPI, inventoryAPI } from '@/lib/api';
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
    const [editingProduct, setEditingProduct] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        sku: '',
        size: '',
        color: 'White',
        weight_grams: '',
        selling_price: '',
        items_per_packet: '100',
        packets_per_bundle: '50',
        items_per_bundle: '600',
        status: 'active',
        factory_id: '',
        raw_material_id: '',
    });

    // Queries
    const { data: products = [], isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['products', selectedFactory],
        queryFn: () => {
            const params = selectedFactory ? { factory_id: selectedFactory } : {};
            return productsAPI.getAll(params).then(res => Array.isArray(res) ? res : []);
        },
    });

    const error = queryError?.message;

    // Query for raw materials (factory-specific)
    const { data: rawMaterials = [], isLoading: rawMaterialsLoading } = useQuery({
        queryKey: ['rawMaterials', formData.factory_id],
        queryFn: async () => {
            if (!formData.factory_id) return [];
            const res = await inventoryAPI.getRawMaterials({ factory_id: formData.factory_id });
            return Array.isArray(res) ? res : [];
        },
        enabled: modalOpen && !!formData.factory_id,
    });

    // Mutations
    const saveMutation = useMutation({
        mutationFn: (data) => editingProduct
            ? productsAPI.update(editingProduct.id, data)
            : productsAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setModalOpen(false);
            toast.success(editingProduct ? 'Product updated successfully' : 'Product created successfully');
        },
        onError: (err) => toast.error(err.message || 'Failed to save product')
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
        setFormData({
            name: '',
            sku: '',
            size: '',
            color: 'White',
            weight_grams: '',
            selling_price: '',
            items_per_packet: '100',
            packets_per_bundle: '50',
            items_per_bundle: '600',
            status: 'active',
            factory_id: selectedFactory || (factories.length === 1 ? factories[0].id : ''),
            raw_material_id: '',
        });
        setModalOpen(true);
    };

    // Open modal for edit
    const handleEdit = (product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name || '',
            sku: product.sku || '',
            size: product.size || '',
            color: product.color || 'White',
            weight_grams: product.weight_grams || '',
            selling_price: product.selling_price || '',
            items_per_packet: product.items_per_packet || '100',
            packets_per_bundle: product.packets_per_bundle || '50',
            items_per_bundle: product.items_per_bundle || '',
            status: product.status || 'active',
            factory_id: product.factory_id || '',
            raw_material_id: product.raw_material_id || '',
        });
        setModalOpen(true);
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();

        const payload = {
            ...formData,
            sku: formData.sku?.trim() || null, // Ensure empty SKU is null
            weight_grams: Number(formData.weight_grams) || 0,
            selling_price: formData.selling_price ? Number(formData.selling_price) : null,
            items_per_packet: Number(formData.items_per_packet) || 0,
            packets_per_bundle: Number(formData.packets_per_bundle) || 0,
            items_per_bundle: formData.items_per_bundle ? Number(formData.items_per_bundle) : null,
            raw_material_id: formData.raw_material_id || null,
        };

        saveMutation.mutate(payload);
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
    const uniqueSKUs = new Set(products.filter((p) => p.sku).map((p) => p.sku)).size;

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
                        <div className={styles.statValue}>{uniqueSKUs}</div>
                        <div className={styles.statLabel}>Unique SKUs</div>
                        <div className={styles.statSublabel}>With SKU codes</div>
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
                                {editingProduct ? 'Edit Product' : 'Add Product'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.modalBody}>
                                {/* Basic Information Section */}
                                <div className={styles.formSection}>
                                    <h3 className={styles.sectionTitle}>Basic Information</h3>
                                    <div className={styles.formRow3}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Name *</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                required
                                                placeholder="e.g., 1L Water Bottle"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>SKU</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                value={formData.sku}
                                                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                                placeholder="Optional"
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

                                    <div className={styles.formRow3}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Size *</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                value={formData.size}
                                                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                                                required
                                                placeholder="e.g., 100ml, 1L"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Color *</label>
                                            <CustomSelect
                                                options={COLORS}
                                                value={formData.color}
                                                onChange={(val) => setFormData({ ...formData, color: val })}
                                            />
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

                                {/* Manufacturing & Pricing Section */}
                                <div className={styles.formSection}>
                                    <h3 className={styles.sectionTitle}>Manufacturing & Pricing</h3>
                                    <div className={styles.formRow3}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Weight (grams) *</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                value={formData.weight_grams ?? ''}
                                                onChange={(e) => setFormData({ ...formData, weight_grams: e.target.value === '' ? '' : e.target.value })}
                                                required
                                                min="0"
                                                step="0.01"
                                            />
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
                                            {formData.factory_id && !rawMaterialsLoading && rawMaterials.length === 0 && (
                                                <p style={{ fontSize: '0.75rem', color: 'var(--color-warning)', marginTop: '0.25rem' }}>
                                                    No materials found.
                                                </p>
                                            )}
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Selling Price</label>
                                            <div className={styles.prefixWrapper}>
                                                <input
                                                    type="number"
                                                    className={styles.formInput}
                                                    value={formData.selling_price ?? ''}
                                                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value === '' ? '' : e.target.value })}
                                                    placeholder="per piece (e.g. 0.80)"
                                                    min="0"
                                                    step="0.01"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Packing Rules Section */}
                                <div className={styles.formSection}>
                                    <h3 className={styles.sectionTitle}>Packing Rules</h3>
                                    <div className={styles.formRow3}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Items per Packet *</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                value={formData.items_per_packet ?? ''}
                                                onChange={(e) => setFormData({ ...formData, items_per_packet: e.target.value === '' ? '' : e.target.value })}
                                                required
                                                min="1"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Packets per Bundle *</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                value={formData.packets_per_bundle ?? ''}
                                                onChange={(e) => setFormData({ ...formData, packets_per_bundle: e.target.value === '' ? '' : e.target.value })}
                                                required
                                                min="1"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Items per Bundle (Direct)</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                value={formData.items_per_bundle ?? ''}
                                                onChange={(e) => setFormData({ ...formData, items_per_bundle: e.target.value === '' ? '' : e.target.value })}
                                                placeholder="For loose-to-bundle"
                                                min="1"
                                            />
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
                                <button type="submit" className={styles.submitButton} disabled={saving}>
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
