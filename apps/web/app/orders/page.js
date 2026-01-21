'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout';
import { Plus, Loader2, ShoppingCart, Eye, Trash2, Filter, Clock } from 'lucide-react';
import { ordersAPI, customersAPI, productsAPI, inventoryAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import styles from './page.module.css';

const ORDER_STATUSES = [
    { value: '', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'reserved', label: 'Reserved' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
];

export default function OrdersPage() {
    const { registerGuide } = useGuide();
    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [viewOrder, setViewOrder] = useState(null);
    const [saving, setSaving] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');

    const [formData, setFormData] = useState({
        customer_id: '',
        items: [],
        notes: '',
    });

    useEffect(() => {
        registerGuide({
            title: "Sales Orders",
            description: "End-to-end management of customer orders and inventory commitment.",
            logic: [
                {
                    title: "The 'Reservation' Lock",
                    explanation: "When you create an order, the system 'locks' the requested bundles. They are moved from 'Finished Goods' to 'Reserved Stock' so they cannot be sold to anyone else while the order is pending."
                },
                {
                    title: "Multi-SKU Ordering",
                    explanation: "One order can contain many different products (SKUs). The system automatically checks if you have enough 'Finished' bundles for each item before allowing the reservation."
                },
                {
                    title: "Release & Reversion",
                    explanation: "If you cancel an order, the 'Reserved' stock is immediately unlocked and flows back into the 'Finished Goods' pool, making it available for other customers again."
                }
            ],
            components: [
                {
                    name: "Order Workflow",
                    description: "Tracks orders as they move through: Pending ➔ Reserved (Stock Locked) ➔ Delivered (Transaction Complete)."
                },
                {
                    name: "Item Matrix",
                    description: "Dynamic list for building orders with live feedback on bundle availability."
                }
            ]
        });
        loadData();
    }, [statusFilter, registerGuide]);

    const loadData = async () => {
        try {
            setLoading(true);
            const params = statusFilter ? { status: statusFilter } : undefined;
            const [ordersData, customersData, productsData] = await Promise.all([
                ordersAPI.getAll(params).catch(() => []),
                customersAPI.getAll().catch(() => []),
                productsAPI.getAll().catch(() => []),
            ]);
            setOrders(Array.isArray(ordersData) ? ordersData : []);
            setCustomers(Array.isArray(customersData) ? customersData : []);
            setProducts(Array.isArray(productsData) ? productsData : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getCustomerName = (id) => customers.find((c) => c.id === id)?.name || 'Unknown';
    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size})` : 'Unknown';
    };

    const handleCreate = () => {
        setFormData({
            customer_id: customers[0]?.id || '',
            items: [{ product_id: products[0]?.id || '', quantity: 1 }],
            notes: '',
        });
        setModalOpen(true);
    };

    const handleAddItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { product_id: products[0]?.id || '', quantity: 1 }],
        });
    };

    const handleRemoveItem = (index) => {
        setFormData({
            ...formData,
            items: formData.items.filter((_, i) => i !== index),
        });
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.items.length === 0) {
            alert('Please add at least one item');
            return;
        }
        setSaving(true);

        try {
            await ordersAPI.create({
                customer_id: formData.customer_id,
                items: formData.items.map((item) => ({
                    product_id: item.product_id,
                    quantity: Number(item.quantity),
                })),
                notes: formData.notes,
            });
            setModalOpen(false);
            loadData();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = async (order) => {
        if (!confirm('Cancel this order? Reserved stock will be released.')) return;

        try {
            await ordersAPI.cancel(order.id);
            loadData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: 'badge-warning',
            reserved: 'badge-primary',
            delivered: 'badge-success',
            cancelled: 'badge-gray',
        };
        return badges[status] || 'badge-gray';
    };

    const totalOrders = orders.length;
    const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'reserved').length;

    return (
        <DashboardLayout title="Sales Orders">
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Sales Orders</h1>
                    <p className={styles.pageDescription}>
                        Manage customer orders and stock reservations
                    </p>
                </div>
                <button
                    className={styles.addButton}
                    onClick={handleCreate}
                    disabled={customers.length === 0 || products.length === 0}
                >
                    <Plus size={18} />
                    <span>New Order</span>
                </button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <ShoppingCart size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{totalOrders}</div>
                        <div className={styles.statLabel}>Total Orders</div>
                        <div className={styles.statSublabel}>All time</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Clock size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{pendingOrders}</div>
                        <div className={styles.statLabel}>Pending/Reserved</div>
                        <div className={styles.statSublabel}>Awaiting delivery</div>
                    </div>
                </div>
            </div>

            {/* Filter */}
            <div className={styles.filterBar}>
                <div className={styles.filterRow}>
                    <div className={styles.filterGroup}>
                        <Filter size={16} className={styles.filterIcon} />
                        <select
                            className={styles.filterSelect}
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            {ORDER_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading orders...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>Error: {error}</p>
                        <button className="btn btn-secondary" onClick={loadData}>
                            Retry
                        </button>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="empty-state">
                        <ShoppingCart size={48} />
                        <p>No orders found</p>
                        {customers.length === 0 || products.length === 0 ? (
                            <p className="text-muted">Add customers and products first</p>
                        ) : (
                            <button className="btn btn-primary" onClick={handleCreate}>
                                Create First Order
                            </button>
                        )}
                    </div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Order ID</th>
                                <th>Customer</th>
                                <th>Items</th>
                                <th>Total Bundles</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((order) => (
                                <tr key={order.id}>
                                    <td className="font-medium">#{order.id?.slice(-6).toUpperCase()}</td>
                                    <td>{getCustomerName(order.customer_id)}</td>
                                    <td>{order.items?.length || 0} items</td>
                                    <td>
                                        {order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0}
                                    </td>
                                    <td>
                                        <span className={cn('badge', getStatusBadge(order.status))}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="text-muted">{formatDate(order.created_at)}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                className="btn btn-sm btn-outline"
                                                onClick={() => setViewOrder(order)}
                                                title="View Details"
                                            >
                                                <Eye size={14} />
                                            </button>
                                            {(order.status === 'pending' || order.status === 'reserved') && (
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    onClick={() => handleCancel(order)}
                                                    title="Cancel Order"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create Order Modal */}
            {modalOpen && (
                <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>New Sales Order</h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Customer *</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.customer_id}
                                        onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                                        required
                                    >
                                        <option value="">Select Customer</option>
                                        {customers.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Order Items */}
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Order Items *</label>
                                    {formData.items.map((item, index) => (
                                        <div key={index} className={styles.itemRow}>
                                            <select
                                                className={styles.itemSelect}
                                                value={item.product_id}
                                                onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                                                required
                                            >
                                                {products.map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} ({p.size}, {p.color})
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                type="number"
                                                className={styles.itemInput}
                                                value={item.quantity}
                                                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                min="1"
                                                required
                                                placeholder="Qty"
                                            />
                                            <span className={styles.itemUnit}>bundles</span>
                                            {formData.items.length > 1 && (
                                                <button
                                                    type="button"
                                                    className={styles.removeItemBtn}
                                                    onClick={() => handleRemoveItem(index)}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className={styles.addItemButton}
                                        onClick={handleAddItem}
                                    >
                                        <Plus size={14} />
                                        Add Item
                                    </button>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Notes</label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        rows={2}
                                        placeholder="Order notes"
                                    />
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.cancelButton} onClick={() => setModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className={styles.submitButton} disabled={saving}>
                                    {saving ? (
                                        <>
                                            <Loader2 size={16} className={styles.spinner} />
                                            Creating...
                                        </>
                                    ) : (
                                        'Create Order'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Order Modal */}
            {viewOrder && (
                <div className="modal-backdrop" onClick={() => setViewOrder(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Order #{viewOrder.id?.slice(-6).toUpperCase()}</h2>
                            <button onClick={() => setViewOrder(null)} className={styles.closeBtn}>
                                ×
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.orderDetail}>
                                <strong>Customer:</strong> {getCustomerName(viewOrder.customer_id)}
                            </div>
                            <div className={styles.orderDetail}>
                                <strong>Status:</strong>{' '}
                                <span className={cn('badge', getStatusBadge(viewOrder.status))}>
                                    {viewOrder.status}
                                </span>
                            </div>
                            <div className={styles.orderDetail}>
                                <strong>Date:</strong> {formatDate(viewOrder.created_at)}
                            </div>
                            {viewOrder.notes && (
                                <div className={styles.orderDetail}>
                                    <strong>Notes:</strong> {viewOrder.notes}
                                </div>
                            )}

                            <h4 style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-2)' }}>Items</h4>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th style={{ textAlign: 'right' }}>Quantity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewOrder.items?.map((item, idx) => (
                                        <tr key={idx}>
                                            <td>{getProductName(item.product_id)}</td>
                                            <td style={{ textAlign: 'right' }}>{item.quantity} bundles</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.cancelButton} onClick={() => setViewOrder(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
