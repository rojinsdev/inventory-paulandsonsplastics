'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout';
import { Plus, Pencil, Trash2, Package, Loader2, X, RefreshCw } from 'lucide-react';
import { productsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatCurrency, cn } from '@/lib/utils';
import styles from './page.module.css';

const COLORS = ['White', 'Black', 'Milky', 'Blue', 'Red', 'Green', 'Yellow', 'Transparent'];

export default function ProductsPage() {
    const { registerGuide } = useGuide();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [saving, setSaving] = useState(false);

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
        status: 'active',
    });

    // Load products
    useEffect(() => {
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
                    explanation: "The 'Selling Price' is your default rate per bundle. You can override this for specific customers in the 'Customers' section if needed."
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
        loadProducts();
    }, [registerGuide]);

    const loadProducts = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await productsAPI.getAll();
            setProducts(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

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
            status: 'active',
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
            status: product.status || 'active',
        });
        setModalOpen(true);
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const payload = {
                ...formData,
                weight_grams: Number(formData.weight_grams),
                selling_price: formData.selling_price ? Number(formData.selling_price) : null,
                items_per_packet: Number(formData.items_per_packet),
                packets_per_bundle: Number(formData.packets_per_bundle),
            };

            if (editingProduct) {
                await productsAPI.update(editingProduct.id, payload);
            } else {
                await productsAPI.create(payload);
            }

            setModalOpen(false);
            loadProducts();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // Handle delete
    const handleDelete = async (product) => {
        if (!confirm(`Delete product "${product.name}"?`)) return;

        try {
            await productsAPI.delete(product.id);
            loadProducts();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    // Toggle status
    const handleToggleStatus = async (product) => {
        try {
            await productsAPI.update(product.id, {
                status: product.status === 'active' ? 'inactive' : 'active',
            });
            loadProducts();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    // Calculate stats
    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.status === 'active').length;
    const uniqueSKUs = new Set(products.filter((p) => p.sku).map((p) => p.sku)).size;

    return (
        <DashboardLayout title="Products">
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
                        <button className={styles.retryButton} onClick={loadProducts}>
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
                                    <th>Items/Pkt</th>
                                    <th>Pkts/Bundle</th>
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
                                        <td>{product.items_per_packet}</td>
                                        <td>{product.packets_per_bundle}</td>
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
                                {/* Basic Info Section */}
                                <div className={styles.formSection}>
                                    <h3 className={styles.sectionTitle}>Basic Information</h3>
                                    <div className={styles.formRow}>
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
                                    </div>

                                    <div className={styles.formRow}>
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
                                            <select
                                                className={styles.formSelect}
                                                value={formData.color}
                                                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                            >
                                                {COLORS.map((color) => (
                                                    <option key={color} value={color}>
                                                        {color}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Specifications Section */}
                                <div className={styles.formSection}>
                                    <h3 className={styles.sectionTitle}>Specifications</h3>
                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Weight (grams) *</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                value={formData.weight_grams}
                                                onChange={(e) => setFormData({ ...formData, weight_grams: e.target.value })}
                                                required
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Selling Price (₹)</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                value={formData.selling_price}
                                                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                                                placeholder="Optional"
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Packing Rules Section */}
                                <div className={styles.formSection}>
                                    <h3 className={styles.sectionTitle}>Packing Rules</h3>
                                    <div className={styles.formRow}>
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
                                        </div>
                                    </div>
                                </div>

                                {/* Status */}
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Status</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
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
        </DashboardLayout>
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
