'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Plus, Loader2, ShoppingCart, Eye, Trash2, Filter, Clock, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { ordersAPI, customersAPI, productsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatDate, cn } from '@/lib/utils';
import { useFactory } from '@/contexts/FactoryContext';
import CustomSelect from '@/components/ui/CustomSelect';
import FactorySelect from '@/components/ui/FactorySelect';
import styles from './page.module.css';

const ORDER_STATUSES = [
    { value: '', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'reserved', label: 'Reserved' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
];

const UNIT_OPTIONS = [
    { value: 'bundle', label: 'Bundles' },
    { value: 'packet', label: 'Packets' },
    { value: 'loose', label: 'Loose Items' },
];

export default function OrdersPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();

    const [modalOpen, setModalOpen] = useState(false);
    const [viewOrder, setViewOrder] = useState(null);
    const [statusFilter, setStatusFilter] = useState('');

    const [formData, setFormData] = useState({
        customer_id: '',
        items: [],
        notes: '',
        order_date: new Date().toISOString().split('T')[0],
    });



    // Queries
    const { data: orders = [], isLoading: ordersLoading, error: ordersError, refetch: refetchOrders } = useQuery({
        queryKey: ['orders', statusFilter, selectedFactory],
        queryFn: () => {
            const params = {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(selectedFactory ? { factory_id: selectedFactory } : {}),
            };
            return ordersAPI.getAll(Object.keys(params).length > 0 ? params : undefined).then(res => Array.isArray(res) ? res : []);
        },
    });

    const { data: customers = [] } = useQuery({
        queryKey: ['customers'],
        queryFn: () => customersAPI.getAll().then(res => Array.isArray(res) ? res : []),
    });

    const { data: products = [] } = useQuery({
        queryKey: ['products'], // Fetch all products for multi-factory support
        queryFn: () => productsAPI.getAll().then(res => Array.isArray(res) ? res : []),
    });

    const loading = ordersLoading;
    const error = ordersError?.message;

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data) => ordersAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setModalOpen(false);
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const cancelMutation = useMutation({
        mutationFn: (id) => ordersAPI.cancel(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const saving = createMutation.isPending;
    const currentOrderDate = new Date().toLocaleDateString();



    useEffect(() => {
        setPageTitle('Sales Orders');
        registerGuide({
            title: "Multi-Factory Sales Orders",
            description: "Manage orders across all factories with real-time preparation tracking.",
            logic: [
                {
                    title: "Horizontal Planning",
                    explanation: "The new horizontal modal allows you to quickly build complex orders featuring products from different factories in one screen."
                },
                {
                    title: "Preparation Notifications",
                    explanation: "When an order is created, product managers at each involved factory are notified. You'll see real-time updates as they 'Mark as Done' each item."
                },
                {
                    title: "Flexible Units",
                    explanation: "Commit stock in Bundles, Packets, or even Loose items depending on the customer's specific needs."
                }
            ],
            components: [
                {
                    name: "Factory Routing",
                    description: "Items are automatically routed to their respective factory managers based on product settings."
                },
                {
                    name: "Preparation Status",
                    description: "Real-time visual feedback on whether items have been picked/packed at the factory level."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);



    const getCustomerName = (id) => customers.find((c) => c.id === id)?.name || 'Unknown';
    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size})` : 'Unknown';
    };

    const handleCreate = () => {
        setFormData({
            customer_id: customers[0]?.id || '',
            items: [{ product_id: products[0]?.id || '', quantity: 1, unit_type: 'bundle' }],
            notes: '',
            order_date: new Date().toISOString().split('T')[0],
        });
        setModalOpen(true);
    };

    const handleAddItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { product_id: products[0]?.id || '', quantity: 1, unit_type: 'bundle' }],
        });
    };



    const handleRemoveItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
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

        createMutation.mutate({
            customer_id: formData.customer_id,
            delivery_date: formData.order_date || new Date().toISOString().split('T')[0],
            items: formData.items.map((item) => ({
                product_id: item.product_id,
                quantity: Number(item.quantity),
                unit_type: item.unit_type,
            })),
            notes: formData.notes,
        });
    };

    const handleCancel = async (order) => {
        if (!confirm('Cancel this order? Reserved stock will be released.')) return;
        cancelMutation.mutate(order.id);
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: 'Warning',
            reserved: 'Primary',
            delivered: 'Success',
            cancelled: 'Gray',
        };
        return `badge${badges[status] || 'Gray'}`;
    };

    const totalOrders = orders.length;
    const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'reserved').length;

    // Options for Selects
    const customerOptions = useMemo(() => customers.map(c => ({
        value: c.id,
        label: c.name
    })), [customers]);

    const productOptions = useMemo(() => products.map(p => {
        const factory = factories.find(f => f.id === p.factory_id);
        const factoryName = factory ? factory.name : 'Unknown Factory';

        return {
            value: p.id,
            label: `[${factoryName}] ${p.name} (${p.size}, ${p.color})`,
            factory_id: p.factory_id,
            factoryName,
            stock: 0 // Mock stock for now
        };
    }), [products, factories]);





    return (
        <div className={styles.container}>
            {loading ? (
                <div className={styles.loaderContainer}>
                    <Loader2 className={styles.spinner} />
                </div>
            ) : (
                <>
                    <div className={styles.pageHeader}>
                        <div>
                            <h1 className={styles.pageTitle}>Sales Orders</h1>
                            <p className={styles.pageDescription}>
                                Multi-factory order management and preparation tracking
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
                                <CustomSelect
                                    options={ORDER_STATUSES}
                                    value={statusFilter}
                                    onChange={(val) => setStatusFilter(val)}
                                    placeholder="Filter Status"
                                    className={styles.filterSelect}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className={styles.tableCard}>
                        {loading ? (
                            <div className={styles.loading}>
                                <Loader2 size={24} className={styles.spinner} />
                                <span>Loading orders...</span>
                            </div>
                        ) : error ? (
                            <div className={styles.error}>
                                <AlertCircle size={32} />
                                <p>Error: {error}</p>
                                <button className={styles.retryButton} onClick={() => refetchOrders()}>
                                    Retry
                                </button>
                            </div>
                        ) : orders.length === 0 ? (
                            <div className={styles.emptyState}>
                                <ShoppingCart size={48} />
                                <p>No orders found</p>
                                {customers.length === 0 || products.length === 0 ? (
                                    <p className={styles.emptyHint}>Add customers and products first</p>
                                ) : (
                                    <button className={styles.primaryButton} onClick={handleCreate}>
                                        Create First Order
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Order ID</th>
                                            <th>Customer</th>
                                            <th>Items</th>
                                            <th>Delivery Date</th>
                                            <th>Status</th>
                                            <th>Date Created</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.map((order) => {
                                            const items = order.sales_order_items || order.items || [];
                                            const prepCount = items.filter(i => i.is_prepared).length;
                                            const allPrepared = items.length > 0 && prepCount === items.length;

                                            return (
                                                <tr key={order.id}>
                                                    <td className={styles.idCell}>#{order.id?.slice(-6).toUpperCase()}</td>
                                                    <td>{getCustomerName(order.customer_id)}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span>{items.length} items</span>
                                                            {items.length > 0 && (
                                                                <span style={{ fontSize: '0.75rem', color: allPrepared ? 'var(--success)' : 'var(--warning)' }}>
                                                                    {prepCount}/{items.length} Prepared
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>{order.delivery_date ? formatDate(order.delivery_date) : 'ASAP'}</td>
                                                    <td>
                                                        <span className={cn(styles.badge, styles[getStatusBadge(order.status)])}>
                                                            {order.status}
                                                        </span>
                                                    </td>
                                                    <td className={styles.dateCell}>{formatDate(order.created_at)}</td>
                                                    <td>
                                                        <div className={styles.actions}>
                                                            <button
                                                                className={styles.actionButton}
                                                                onClick={() => setViewOrder(order)}
                                                                title="View Details"
                                                            >
                                                                <Eye size={14} />
                                                            </button>
                                                            {(order.status === 'pending' || order.status === 'reserved') && (
                                                                <button
                                                                    className={styles.actionButton}
                                                                    onClick={() => handleCancel(order)}
                                                                    title="Cancel Order"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
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
                </>
            )}

            {/* Create Order Modal */}
            {modalOpen && (
                <div className={styles.modalBackdrop} onClick={() => setModalOpen(false)}>
                    <div className={cn(styles.modal, styles.modalWide)} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Create Sales Order</h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Customer</label>
                                        <CustomSelect
                                            options={customerOptions}
                                            value={formData.customer_id}
                                            onChange={(val) => setFormData({ ...formData, customer_id: val })}
                                            placeholder="Select Customer"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Delivery Goal</label>
                                        <input
                                            type="date"
                                            className={styles.input}
                                            value={formData.order_date}
                                            onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className={styles.itemHeader}>
                                    <h3 className={styles.sectionTitle}>Order Items</h3>
                                    <button
                                        type="button"
                                        className={styles.addItemButton}
                                        onClick={handleAddItem}
                                    >
                                        <Plus size={16} />
                                        <span>Add Item</span>
                                    </button>
                                </div>

                                <div className={styles.itemsList}>
                                    {formData.items.map((item, index) => (
                                        <div key={index} className={styles.itemRow}>
                                            <div className={styles.productSelect}>
                                                <CustomSelect
                                                    options={productOptions}
                                                    value={item.product_id}
                                                    onChange={(val) => handleItemChange(index, 'product_id', val)}
                                                    placeholder="Select Product"
                                                    searchable={false}
                                                />
                                            </div>
                                            <div className={styles.quantityInput}>
                                                <input
                                                    type="number"
                                                    className={styles.input}
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                    min="1"
                                                    placeholder="Qty"
                                                />
                                            </div>
                                            <div className={styles.unitSelect}>
                                                <CustomSelect
                                                    options={UNIT_OPTIONS}
                                                    value={item.unit_type}
                                                    onChange={(val) => handleItemChange(index, 'unit_type', val)}
                                                    placeholder="Unit"
                                                    searchable={false}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.removeBtn}
                                                onClick={() => handleRemoveItem(index)}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
                                    <label className={styles.formLabel}>Special Notes</label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Add any specific delivery or packing instructions..."
                                        rows={3}
                                    />
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
                                    disabled={createMutation.isPending}
                                >
                                    {createMutation.isPending ? (
                                        <>
                                            <Loader2 size={18} className={styles.spinner} />
                                            <span>Creating...</span>
                                        </>
                                    ) : (
                                        <span>Create Order</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Order Modal */}
            {viewOrder && (
                <div className={styles.modalBackdrop} onClick={() => setViewOrder(null)}>
                    <div className={cn(styles.modal, styles.modalWide)} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                Order Details <span className={styles.orderIdEmphasis}>#{viewOrder.id?.slice(-6).toUpperCase()}</span>
                            </h2>
                            <button onClick={() => setViewOrder(null)} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.orderDetailsGrid}>
                                <div className={styles.orderDetailColumn}>
                                    <div className={styles.orderDetail}>
                                        <span className={styles.detailLabel}>Customer</span>
                                        <span className={styles.detailValue}>{getCustomerName(viewOrder.customer_id)}</span>
                                    </div>
                                    <div className={styles.orderDetail}>
                                        <span className={styles.detailLabel}>Status</span>
                                        <span className={cn(styles.badge, styles[getStatusBadge(viewOrder.status)])}>
                                            {viewOrder.status}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.verticalSeparator}></div>
                                <div className={styles.orderDetailColumn}>
                                    <div className={styles.orderDetail}>
                                        <span className={styles.detailLabel}>Order Date</span>
                                        <span className={styles.detailValue}>{formatDate(viewOrder.created_at)}</span>
                                    </div>
                                    <div className={styles.orderDetail}>
                                        <span className={styles.detailLabel}>Delivery Goal</span>
                                        <span className={styles.detailValue}>{viewOrder.delivery_date ? formatDate(viewOrder.delivery_date) : 'ASAP'}</span>
                                    </div>
                                </div>
                            </div>

                            {viewOrder.notes && (
                                <div className={styles.orderDetail}>
                                    <strong>Notes:</strong> {viewOrder.notes}
                                </div>
                            )}

                            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontWeight: 600 }}>Involved Factory Preparation</h4>
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.colProduct}>Product</th>
                                            <th className={styles.colFactory}>Factory</th>
                                            <th className={styles.colQuantity}>Quantity</th>
                                            <th className={styles.colUnit}>Unit</th>
                                            <th className={styles.colStatus}>Preparation Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(viewOrder.sales_order_items || viewOrder.items || []).map((item, idx) => {
                                            const p = products.find(prod => prod.id === item.product_id);
                                            const f = factories.find(fac => fac.id === p?.factory_id);

                                            return (
                                                <tr key={idx}>
                                                    <td className={styles.colProduct}>{p?.name || 'Unknown'}</td>
                                                    <td className={styles.colFactory}>{f?.name || 'Unknown'}</td>
                                                    <td className={styles.colQuantity}>{item.quantity}</td>
                                                    <td className={styles.colUnit}>{item.unit_type || 'bundle'}</td>
                                                    <td className={styles.colStatus}>
                                                        <div className={styles.prepStatusWrapper}>
                                                            <div className={cn(styles.badge, item.is_prepared ? styles.badgeSuccess : styles.badgeWarning)}>
                                                                {item.is_prepared ? (
                                                                    <>
                                                                        <CheckCircle2 size={14} />
                                                                        <span>Done</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Clock size={14} className={styles.cautionIcon} />
                                                                        <span>Pending</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {item.is_prepared && item.prepared_at && (
                                                            <div className={styles.prepInfo}>
                                                                Ready on {formatDate(item.prepared_at)}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.secondaryButton} onClick={() => setViewOrder(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
