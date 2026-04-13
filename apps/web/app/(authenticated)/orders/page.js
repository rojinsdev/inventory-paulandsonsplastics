'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import OrderValidation from '@/lib/validation/orderValidation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Plus, Loader2, ShoppingCart, Eye, Trash2, Edit, Filter, Clock, AlertCircle, CheckCircle2, X, User, Calendar, ClipboardList, Package } from 'lucide-react';
import { ordersAPI, customersAPI, productsAPI, inventoryAPI, capsAPI } from '@/lib/api';
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
    { value: 'loose', label: 'Loose Tubs' },
];

export default function OrdersPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();

    const [modalOpen, setModalOpen] = useState(false);
    const [viewOrder, setViewOrder] = useState(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 15;

    const [formData, setFormData] = useState({
        customer_id: '',
        items: [],
        notes: '',
        order_date: new Date().toISOString().split('T')[0],
    });
    const [isEditing, setIsEditing] = useState(false);
    const [editOrderId, setEditOrderId] = useState(null);
    const [isPreparing, setIsPreparing] = useState(false);
    const [selectedPrepItems, setSelectedPrepItems] = useState([]);



    // Queries
    const { data, isLoading: ordersLoading, error: ordersError, refetch: refetchOrders } = useQuery({
        queryKey: ['orders', statusFilter, selectedFactory, page],
        queryFn: () => {
            const params = {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(selectedFactory ? { factory_id: selectedFactory } : {}),
                page,
                size: pageSize,
            };
            return ordersAPI.getAll(params);
        },
    });

    const orders = data?.orders || [];
    const pagination = data?.pagination || { total: 0, page: 1, size: pageSize };
    const totalPages = Math.ceil((pagination.total || 0) / pageSize);

    const { data: customers = [] } = useQuery({
        queryKey: ['customers'],
        queryFn: () => customersAPI.getAll().then(res => res?.customers || res?.data || (Array.isArray(res) ? res : [])),
    });

    const { data: tubs = [] } = useQuery({
        queryKey: ['tubs'], // Fetch all tubs for multi-factory support
        queryFn: () => productsAPI.getAll().then(res => res?.products || res?.data || (Array.isArray(res) ? res : [])),
    });

    const { data: caps = [] } = useQuery({
        queryKey: ['caps'],
        queryFn: () => capsAPI.getAll().then(res => res?.caps || res?.data || (Array.isArray(res) ? res : [])),
    });

    const { data: availableStock = [] } = useQuery({
        queryKey: ['availableStock'],
        queryFn: () => inventoryAPI.getAvailableStock().then(res => res || []),
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

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => ordersAPI.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setModalOpen(false);
            setIsEditing(false);
            setEditOrderId(null);
        },
        onError: (err) => alert('Error updating order: ' + err.message)
    });

    const cancelMutation = useMutation({
        mutationFn: (id) => ordersAPI.cancel(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (err) => alert('Error: ' + err.message)
    });

    const prepareMutation = useMutation({
        mutationFn: ({ id, items }) => ordersAPI.prepareItems(id, items),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['availableStock'] });
            setIsPreparing(false);
            setViewOrder(null);
            alert('Stock reserved and order items prepared successfully!');
        },
        onError: (err) => alert('Reservation failed: ' + err.message)
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
                    explanation: "The new horizontal modal allows you to quickly build complex orders featuring tubs from different factories in one screen."
                },
                {
                    title: "Preparation Notifications",
                    explanation: "When an order is created, tub managers at each involved factory are notified. You'll see real-time updates as they 'Mark as Done' each item."
                },
                {
                    title: "Flexible Units",
                    explanation: "Commit stock in Tubs, Packets, or even Loose items depending on the customer's specific needs."
                }
            ],
            components: [
                {
                    name: "Factory Routing",
                    description: "Items are automatically routed to their respective factory managers based on tub settings."
                },
                {
                    name: "Preparation Status",
                    description: "Real-time visual feedback on whether items have been picked/packed at the factory level."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);



    const getCustomerName = (id) => customers.find((c) => c.id === id)?.name || 'Unknown';
    const getTubName = (id) => {
        const p = tubs.find((p) => p.id === id);
        return p ? `${p.name} (${p.size})` : 'Unknown';
    };
    const getCapName = (id) => {
        const c = caps.find((c) => c.id === id);
        return c ? c.name : 'Unknown';
    };
    const getTubDisplay = (item) => {
        const p = item.product_id ? tubs.find((t) => t.id === item.product_id) : item.products;
        if (!p) return '—';
        const color = p.color ? `, ${p.color}` : '';
        return `${p.name} (${p.size}${color})`;
    };
    const getCapDisplay = (item) => {
        const c = item.cap_id ? caps.find((cap) => cap.id === item.cap_id) : item.caps;
        if (!c) return '—';
        const color = c.color ? ` (${c.color})` : '';
        return `${c.name}${color}`;
    };
    const getColorSummary = (item) => {
        const p = item.product_id ? tubs.find((t) => t.id === item.product_id) : item.products;
        const c = item.cap_id ? caps.find((cap) => cap.id === item.cap_id) : item.caps;
        const tubColor = p?.color || '—';
        const capColor = c?.color || '—';
        if (!p && c) return `Cap: ${capColor}`;
        if (p && !c) return `Tub: ${tubColor}`;
        return `Tub: ${tubColor} / Cap: ${capColor}`;
    };
    const getItemName = (item) => {
        if (item.product_id) return getTubName(item.product_id);
        if (item.cap_id) return getCapName(item.cap_id);
        if (item.products) return `${item.products.name} (${item.products.size})`;
        if (item.caps) return item.caps.name;
        return 'Unknown Item';
    };

    const handleCreate = () => {
        setIsEditing(false);
        setEditOrderId(null);
        setFormData({
            customer_id: customerOptions[0]?.value || '',
            items: [{
                factory_id: factoryOptions[0]?.value || '',
                product_id: '',
                quantity: 1,
                unit_type: 'bundle',
                unit_price: '',
                include_inner: true
            }],
            notes: '',
            order_date: new Date().toISOString().split('T')[0],
        });
        setModalOpen(true);
    };

    const handleEdit = (order) => {
        setIsEditing(true);
        setEditOrderId(order.id);
        
        const items = order.sales_order_items || order.items || [];
        setFormData({
            customer_id: order.customer_id,
            items: items.map(item => {
                const p = tubs.find(prod => prod.id === item.product_id);
                const c = caps.find(cp => cp.id === item.cap_id);
                return {
                    factory_id: (p?.factory_id || c?.factory_id || ''),
                    product_id: item.product_id || '',
                    cap_id: item.cap_id || '',
                    item_type: item.cap_id ? 'cap' : 'product',
                    quantity: item.quantity,
                    unit_type: item.unit_type || (item.cap_id ? 'loose' : 'bundle'),
                    unit_price: item.unit_price || '',
                    include_inner: item.product_id
                        ? item.include_inner !== false
                        : false,
                };
            }),
            notes: order.notes || '',
            order_date: order.delivery_date || new Date().toISOString().split('T')[0],
        });
        setModalOpen(true);
    };

    const handleAddItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, {
                factory_id: factories[0]?.id || '',
                product_id: '',
                cap_id: '',
                item_type: 'product',
                quantity: 1,
                unit_type: 'bundle',
                unit_price: '',
                include_inner: true
            }],
        });
    };



    const handleRemoveItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        if (field === 'factory_id') {
            // Reset product/cap when factory changes
            newItems[index] = { ...newItems[index], [field]: value, product_id: '', cap_id: '' };
        } else if (field === 'item_type') {
            // Reset selection when switching types
            newItems[index] = { 
                ...newItems[index], 
                [field]: value, 
                product_id: '', 
                cap_id: '',
                unit_type: value === 'cap' ? 'loose' : 'bundle',
                include_inner: value === 'cap' ? false : true,
            };
        } else if (field === 'product_id') {
            // Reset cap when product changes (new product may have different cap template)
            const tub = tubOptions.find((t) => t.value === value);
            newItems[index] = {
                ...newItems[index],
                [field]: value,
                cap_id: '',
                include_inner: tub?.hasInner ? true : false,
            };
        } else if (field === 'unit_type') {
            // Clear cap_id when switching to loose (caps not needed for loose tubs)
            const updates = { [field]: value };
            if (value === 'loose') {
                updates.cap_id = '';
            }
            newItems[index] = { ...newItems[index], ...updates };
        } else {
            newItems[index] = { ...newItems[index], [field]: value };
        }
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Prepare payload first
        const payload = {
            customer_id: formData.customer_id,
            delivery_date: formData.order_date || new Date().toISOString().split('T')[0],
            items: formData.items.map((item) => ({
                product_id: item.product_id || undefined,
                cap_id: item.cap_id || undefined,
                quantity: Number(item.quantity),
                unit_type: item.unit_type,
                unit_price: item.unit_price ? Number(item.unit_price) : undefined,
                include_inner: item.product_id
                    ? (tubOptions.find((t) => t.value === item.product_id)?.hasInner
                        ? item.include_inner !== false
                        : false)
                    : false,
            })),
            notes: formData.notes,
        };

        // Comprehensive client-side validation
        try {
            const validationErrors = OrderValidation.validateOrderCreation(payload);

            if (validationErrors.length > 0) {
                const formattedErrors = OrderValidation.formatErrors(validationErrors);
                
                // Show detailed error message
                const errorMessage = `Order validation failed:\n\n${formattedErrors.details.map(err => `• ${err.message}`).join('\n')}`;
                alert(errorMessage);
                
                // Log validation errors for debugging
                console.error('Order validation errors:', formattedErrors);
                return;
            }

            // If validation passes, submit the order
            if (isEditing) {
                updateMutation.mutate({ id: editOrderId, data: payload });
            } else {
                createMutation.mutate(payload);
            }
        } catch (error) {
            console.error('Validation error:', error);
            alert('An error occurred during validation. Please check your input and try again.');
        }
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

    const factoryOptions = useMemo(() => factories.map(f => ({
        value: f.id,
        label: f.name
    })), [factories]);

    const tubOptions = useMemo(() => tubs.map(p => {
        const factory = factories.find(f => f.id === p.factory_id);
        const factoryName = factory ? factory.name : 'Unknown Factory';
        const templateData = Array.isArray(p.product_templates) ? p.product_templates[0] : p.product_templates;
        const hasInner = !!templateData?.inner_template_id;
        const hasCapTemplate = !!templateData?.cap_template_id;

        return {
            value: p.id,
            label: `${p.name} (${p.size}, ${p.color})`,
            factory_id: p.factory_id,
            factoryName,
            hasInner,
            hasCapTemplate,
            capTemplateId: templateData?.cap_template_id,
            color: p.color
        };
    }), [tubs, factories]);

    const capOptions = useMemo(() => caps.map(c => {
        const factory = factories.find(f => f.id === c.factory_id);
        return {
            value: c.id,
            label: c.color ? `${c.name} (${c.color})` : c.name,
            factory_id: c.factory_id,
            factoryName: factory ? factory.name : 'Unknown Factory',
            template_id: c.template_id
        };
    }), [caps, factories]);

    // Get available caps for a specific product (based on template and factory)
    const getCapOptionsForProduct = useCallback((productId, factoryId) => {
        const product = tubOptions.find(t => t.value === productId);
        if (!product?.hasCapTemplate) return [];
        
        return capOptions.filter(c => 
            c.template_id === product.capTemplateId &&
            (!factoryId || c.factory_id === factoryId)
        );
    }, [tubOptions, capOptions]);

    const getStockForProduct = (productId, unitType, capId) => {
        // For tub+cap combinations, filter by both product_id and cap_id
        // For cap-only orders, filter by cap_id only
        // For tub-only orders, filter by product_id only
        const stockItems = availableStock.filter(s => {
            if (productId && capId) {
                // Tub+cap combination: must match both
                return s.product_id === productId && s.cap_id === capId;
            } else if (capId) {
                // Cap-only order
                return s.cap_id === capId;
            } else if (productId) {
                // Tub-only order (loose or no cap required)
                return s.product_id === productId;
            }
            return false;
        });
        
        // Map unit types to inventory states
        const stateMapping = {
            'loose': capId ? 'finished' : 'semi_finished', // Caps are finished goods even when loose
            'packet': 'packed',
            'bundle': 'finished'
        };

        const targetState = stateMapping[unitType] || 'finished';

        const filtered = stockItems.filter(s => {
            // Check matching state
            if (s.state !== targetState) return false;
            
            // For finished goods, if unit_type is specified in stock, it must match
            // If stock has no unit_type, we assume it's the requested type if requested type is the default (bundle)
            if (targetState === 'finished' && s.unit_type && s.unit_type !== unitType) {
                // Special case for loose caps which are stored with unit_type 'loose' in state 'finished'
                if (capId && unitType === 'loose' && s.unit_type === 'loose') {
                    return true;
                }
                return false;
            }
            return true;
        });

        return filtered.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    };

    const getEligiblePrepItems = (order) => {
        if (!order) return [];
        const items = order.sales_order_items || [];
        const requests = order.production_requests || [];
        
        return items.filter(item => {
            // Already fully reserved/prepared?
            if (item.is_prepared) return false;
            
            // If not backordered, it's immediately available to reserve
            if (!item.is_backordered) return true;
            
            // If backordered, it must have been marked as 'prepared' in production_requests
            const req = requests.find(r => 
                (r.product_id === item.product_id || (r.product_id === null && item.product_id === null)) && 
                (r.cap_id === item.cap_id || (r.cap_id === null && item.cap_id === null))
            );
            return req?.status === 'prepared';
        });
    };

    const handleStartPreparation = () => {
        const eligible = getEligiblePrepItems(viewOrder);
        setSelectedPrepItems(eligible.map(item => ({
            itemId: item.id,
            quantity: item.quantity - (item.quantity_reserved || 0), // Remaining to reserve
            originalItem: item
        })));
        setIsPreparing(true);
    };

    const handleExecutePreparation = () => {
        const itemsToPrepare = selectedPrepItems.filter(i => i.quantity > 0);
        if (itemsToPrepare.length === 0) {
            alert('No items selected for reservation');
            return;
        }

        if (!confirm(`Are you sure you want to reserve stock for ${itemsToPrepare.length} items? This will forward the order to Dispatch.`)) return;
        
        prepareMutation.mutate({
            id: viewOrder.id,
            items: itemsToPrepare.map(i => ({ itemId: i.itemId, quantity: i.quantity }))
        });
    };

    const orderSummary = useMemo(() => {
        const totals = {
            unique_items: formData.items.length,
            total_quantity: formData.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
            units: {}
        };

        formData.items.forEach(item => {
            if (item.unit_type && item.quantity) {
                totals.units[item.unit_type] = (totals.units[item.unit_type] || 0) + Number(item.quantity);
            }
        });

        return totals;
    }, [formData.items]);





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
                                Multi-factory tub order management and preparation tracking
                            </p>
                        </div>
                        <button
                            className={styles.addButton}
                            onClick={handleCreate}
                            disabled={customers.length === 0 || tubs.length === 0}
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
                                {customers.length === 0 || tubs.length === 0 ? (
                                    <p className={styles.emptyHint}>Add customers and tubs first</p>
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
                                                                <>
                                                                    <button
                                                                        className={styles.actionButton}
                                                                        onClick={() => handleEdit(order)}
                                                                        title="Edit Order"
                                                                    >
                                                                        <Edit size={14} />
                                                                    </button>
                                                                    <button
                                                                        className={styles.actionButton}
                                                                        onClick={() => handleCancel(order)}
                                                                        title="Cancel Order"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                
                                {totalPages > 1 && (
                                    <div className={styles.pagination}>
                                        <button 
                                            className={styles.pageButton} 
                                            disabled={page === 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                        >
                                            Previous
                                        </button>
                                        <span className={styles.pageInfo}>
                                            Page {page} of {totalPages}
                                        </span>
                                        <button 
                                            className={styles.pageButton} 
                                            disabled={page >= totalPages}
                                            onClick={() => setPage(p => p + 1)}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
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
                            <h2 className={styles.modalTitle}>
                                {isEditing ? `Edit Sales Order #${editOrderId?.slice(-6).toUpperCase()}` : 'New Sales Order'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.splitForm}>
                            <div className={styles.formBody}>
                            {/* Left Panel: Delivery Details */}
                            <div className={styles.formPanel}>
                                <div className={styles.panelTitle}>
                                    <div className={styles.sectionIcon}>
                                        <User size={18} />
                                    </div>
                                    <h3>Delivery Details</h3>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabelModern}>
                                        <User size={14} /> Customer
                                    </label>
                                    <CustomSelect
                                        options={customerOptions}
                                        value={formData.customer_id}
                                        onChange={(val) => setFormData({ ...formData, customer_id: val })}
                                        placeholder="Select Customer"
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabelModern}>
                                        <Calendar size={14} /> Delivery Goal
                                    </label>
                                    <input
                                        type="date"
                                        className={styles.inputModern}
                                        value={formData.order_date}
                                        onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                                    />
                                </div>

                                <div className={styles.notesArea}>
                                    <label className={styles.formLabelModern}>
                                        <ClipboardList size={14} /> Special Notes
                                    </label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Packing instructions, route notes..."
                                        rows={4}
                                    />
                                </div>
                            </div>

                            {/* Right Panel: Product Selection */}
                            <div className={styles.mainPanel}>
                                <div className={styles.panelHeader}>
                                    <div className={styles.panelTitle}>
                                        <Package size={20} className={styles.cautionIcon} />
                                        <span>Order Items</span>
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.addBtnModern}
                                        onClick={handleAddItem}
                                    >
                                        <Plus size={18} />
                                        <span>Add Item</span>
                                    </button>
                                </div>

                                <div className={styles.scrollArea}>
                                    {formData.items.length === 0 ? (
                                        <div className={styles.itemEmpty}>
                                            <ShoppingCart size={48} strokeWidth={1} style={{ marginBottom: '16px', opacity: 0.5 }} />
                                            <div className={styles.itemEmptyTitle}>Your order is empty</div>
                                            <p className={styles.itemEmptyText}>
                                                Use the button above to add tubs to this sales order.
                                            </p>
                                        </div>
                                    ) : (
                                        formData.items.map((item, index) => {
                                            const currentStock = getStockForProduct(item.product_id, item.unit_type, item.cap_id);
                                            const needsCapSelection = item.item_type === 'product' &&
                                                item.product_id &&
                                                ['packet', 'bundle'].includes(item.unit_type) &&
                                                tubOptions.find(t => t.value === item.product_id)?.hasCapTemplate;

                                            return (
                                                <div key={index} className={styles.itemCard}>
                                                    <div className={styles.itemCardHeader}>
                                                        <span className={styles.itemNumber}>ITEM #{String(index + 1).padStart(2, '0')}</span>
                                                        <div className={styles.itemHeaderRight}>
                                                            {(item.product_id || item.cap_id) && (
                                                                <div className={styles.stockIndicator}>
                                                                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: currentStock > 0 ? '#10b981' : '#f43f5e' }}></div>
                                                                    <span>Available Stock: <span className={styles.stockValue}>{currentStock}</span></span>
                                                                </div>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className={styles.removeButton}
                                                                onClick={() => handleRemoveItem(index)}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Row 1: Type, Factory, Product, Cap (if needed) */}
                                                    <div className={cn(styles.productSelectGridRow1, needsCapSelection ? styles.productSelectGridRow1WithCap : styles.productSelectGridRow1NoCap)}>
                                                        {/* Item Type Toggle */}
                                                        <div className={styles.formItem}>
                                                            <div className={styles.typeToggle}>
                                                                <button
                                                                    type="button"
                                                                    className={cn(styles.toggleBtn, item.item_type === 'product' && styles.toggleActive)}
                                                                    onClick={() => handleItemChange(index, 'item_type', 'product')}
                                                                >
                                                                    Tub
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={cn(styles.toggleBtn, item.item_type === 'cap' && styles.toggleActive)}
                                                                    onClick={() => handleItemChange(index, 'item_type', 'cap')}
                                                                >
                                                                    Cap
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Factory Select */}
                                                        <div className={styles.formItem}>
                                                            <CustomSelect
                                                                options={factoryOptions}
                                                                value={item.factory_id}
                                                                onChange={(val) => handleItemChange(index, 'factory_id', val)}
                                                                placeholder="Select Factory"
                                                                searchable={false}
                                                                className={styles.orderSelect}
                                                            />
                                                        </div>
 
                                                        {/* Item Select */}
                                                        <div className={styles.formItem}>
                                                            <CustomSelect
                                                                options={item.item_type === 'cap' 
                                                                    ? capOptions.filter(c => !item.factory_id || c.factory_id === item.factory_id)
                                                                    : tubOptions.filter(p => !item.factory_id || p.factory_id === item.factory_id)
                                                                }
                                                                value={item.item_type === 'cap' ? item.cap_id : item.product_id}
                                                                onChange={(val) => handleItemChange(index, item.item_type === 'cap' ? 'cap_id' : 'product_id', val)}
                                                                placeholder={item.item_type === 'cap' ? "Choose Cap..." : "Choose Tub..."}
                                                                searchable={true}
                                                                className={styles.orderSelect}
                                                            />
                                                        </div>

                                                        {needsCapSelection && (
                                                            <div className={styles.formItem}>
                                                                <CustomSelect
                                                                    options={getCapOptionsForProduct(item.product_id, item.factory_id)}
                                                                    value={item.cap_id || ''}
                                                                    onChange={(val) => handleItemChange(index, 'cap_id', val)}
                                                                    placeholder="Select Cap..."
                                                                    searchable={true}
                                                                    className={styles.orderSelect}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Row 2: Quantity, Unit, Rate */}
                                                    <div className={styles.productSelectGridRow2}>
                                                        {/* Quantity */}
                                                        <div className={styles.formItem}>
                                                            <input
                                                                type="number"
                                                                className={styles.inputModern}
                                                                value={item.quantity}
                                                                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                                placeholder="Qty"
                                                                min="1"
                                                            />
                                                        </div>

                                                        {/* Unit */}
                                                        <div className={styles.formItem}>
                                                            <CustomSelect
                                                                options={item.item_type === 'cap' ? [{ value: 'loose', label: 'Loose Caps' }] : UNIT_OPTIONS}
                                                                value={item.unit_type}
                                                                onChange={(val) => handleItemChange(index, 'unit_type', val)}
                                                                placeholder="Unit"
                                                                searchable={false}
                                                                className={styles.orderSelect}
                                                            />
                                                        </div>

                                                        {/* Rate (Optional) */}
                                                        <div className={styles.formItem}>
                                                            <input
                                                                type="number"
                                                                className={styles.inputModern}
                                                                value={item.unit_price}
                                                                onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                                                placeholder="Rate (Opt)"
                                                                min="0"
                                                                step="0.01"
                                                            />
                                                        </div>
                                                    </div>

                                                        {/* Include Inner Toggle */}
                                                        {tubOptions.find(op => op.value === item.product_id)?.hasInner && (
                                                            <div className={styles.innerToggleContainer}>
                                                                <div className={styles.innerToggle}>
                                                                    <input
                                                                        type="checkbox"
                                                                        id={`include_inner_${index}`}
                                                                        checked={item.include_inner !== false}
                                                                        onChange={(e) => handleItemChange(index, 'include_inner', e.target.checked)}
                                                                        className={styles.checkboxModern}
                                                                    />
                                                                    <label htmlFor={`include_inner_${index}`} className={styles.toggleLabel}>
                                                                        <span className={styles.toggleTitle}>With inner (liner)</span>
                                                                        <span className={styles.toggleDescription}>On by default — turn off if the customer does not want the inner. Affects which stock can fulfill this line.</span>
                                                                    </label>
                                                                </div>
                                                            </div>
                                                        )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                </div>
                            </div>

                            <div className={styles.formFooter}>
                                <div className={styles.footerSummary}>
                                    <div className={styles.summaryItem}>
                                        <div className={styles.summaryLabel}>Total Items</div>
                                        <div className={styles.summaryValue}>{orderSummary.unique_items}</div>
                                    </div>
                                    <div className={styles.summaryItem}>
                                        <div className={styles.summaryLabel}>Bundles</div>
                                        <div className={styles.summaryValue}>{orderSummary.units['bundle'] || 0}</div>
                                    </div>
                                    {Object.entries(orderSummary.units).map(([unit, qty]) => {
                                        if (unit === 'bundle') return null;
                                        return (
                                            <div key={unit} className={styles.summaryItem}>
                                                <div className={styles.summaryLabel}>{unit}s</div>
                                                <div className={styles.summaryValue}>{qty}</div>
                                            </div>
                                        );
                                    })}
                                    <div className={styles.summaryItem}>
                                        <div className={styles.summaryLabel}>Total Units</div>
                                        <div className={styles.summaryValue}>{orderSummary.total_quantity}</div>
                                    </div>
                                </div>

                                <div className={styles.footerActions}>
                                    <button
                                        type="submit"
                                        className={styles.submitButton}
                                        disabled={createMutation.isPending || updateMutation.isPending}
                                    >
                                        {createMutation.isPending || updateMutation.isPending ? (
                                            <>
                                                <Loader2 size={18} className={styles.spinner} />
                                                <span>{isEditing ? 'Updating...' : 'Creating...'}</span>
                                            </>
                                        ) : (
                                            <span>{isEditing ? 'Update Order' : 'Create Order'}</span>
                                        )}
                                    </button>
                                </div>
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
                            <button onClick={() => {
                                setViewOrder(null);
                                setIsPreparing(false);
                            }} className={styles.closeBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            {isPreparing ? (
                                <div className={styles.preparationContainer}>
                                    <div className={styles.prepHeader}>
                                        <div className={styles.prepStepInfo}>
                                            <Package size={24} className={styles.prepIcon} />
                                            <div>
                                                <h3 className={styles.prepStepTitle}>Order Preparation & Stock Reservation</h3>
                                                <p className={styles.prepStepDescription}>Select available items to reserve stock and mark them ready for dispatch.</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.tableWrapper}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th>Item</th>
                                                    <th>Unit</th>
                                                    <th>In Stock</th>
                                                    <th>Needed</th>
                                                    <th>To Reserve</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedPrepItems.map((item, idx) => {
                                                    const stockValue = getStockForProduct(
                                                        item.originalItem.product_id, 
                                                        item.originalItem.unit_type, 
                                                        item.originalItem.cap_id
                                                    );
                                                    const needed = item.originalItem.quantity - (item.originalItem.quantity_reserved || 0);
                                                    
                                                    return (
                                                        <tr key={idx}>
                                                            <td>{getItemName(item.originalItem)}</td>
                                                            <td>{item.originalItem.unit_type}</td>
                                                            <td>
                                                                <span className={stockValue >= needed ? styles.stockOk : styles.stockShort}>
                                                                    {stockValue}
                                                                </span>
                                                            </td>
                                                            <td>{needed}</td>
                                                            <td>
                                                                <input 
                                                                    type="number" 
                                                                    className={styles.inputModern}
                                                                    style={{ width: '80px' }}
                                                                    value={item.quantity}
                                                                    onChange={(e) => {
                                                                        const val = parseInt(e.target.value);
                                                                        const updated = [...selectedPrepItems];
                                                                        updated[idx].quantity = isNaN(val) ? 0 : Math.min(val, needed);
                                                                        setSelectedPrepItems(updated);
                                                                    }}
                                                                    max={needed}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {selectedPrepItems.length === 0 && (
                                                    <tr>
                                                        <td colSpan="5" className={styles.emptyItemsText}>
                                                            <div className={styles.emptyStateContainer}>
                                                                <Clock size={40} opacity={0.5} />
                                                                <p>No items are currently eligible for reservation.</p>
                                                                <small>Backordered items must be marked as &quot;Prepared&quot; in Production first.</small>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <>
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
                                        <div className={styles.orderDetail} style={{ marginTop: '1rem' }}>
                                            <strong>Notes:</strong> {viewOrder.notes}
                                        </div>
                                    )}

                                    <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontWeight: 600 }}>Involved Factory Preparation</h4>
                                    <div className={styles.tableWrapper}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th className={styles.colProduct}>Tub</th>
                                                    <th className={styles.colCap}>Cap</th>
                                                    <th className={styles.colColor}>Color</th>
                                                    <th className={styles.colColor}>Inner</th>
                                                    <th className={styles.colFactory}>Factory</th>
                                                    <th className={styles.colQuantity}>Needed</th>
                                                    <th className={styles.colUnit}>Reserved</th>
                                                    <th className={styles.colStatus}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(viewOrder.sales_order_items || viewOrder.items || []).map((item, idx) => {
                                                    const p = tubs.find(prod => prod.id === item.product_id);
                                                    const c = caps.find(cp => cp.id === item.cap_id);
                                                    const f = factories.find(fac => fac.id === (p?.factory_id || c?.factory_id));

                                                    const tubForInner = tubs.find(prod => prod.id === item.product_id);
                                                    const tplInner = Array.isArray(tubForInner?.product_templates)
                                                        ? tubForInner.product_templates[0]
                                                        : tubForInner?.product_templates;
                                                    const lineHasInnerTpl = !!tplInner?.inner_template_id;

                                                    return (
                                                        <tr key={idx}>
                                                            <td className={styles.colProduct}>{getTubDisplay(item)}</td>
                                                            <td className={styles.colCap}>{getCapDisplay(item)}</td>
                                                            <td className={styles.colColor}>{getColorSummary(item)}</td>
                                                            <td className={styles.colColor}>
                                                                {!item.product_id ? '—' : !lineHasInnerTpl ? '—' : (item.include_inner !== false ? 'With inner' : 'Without inner')}
                                                            </td>
                                                            <td className={styles.colFactory}>{f?.name || 'Unknown'}</td>
                                                            <td className={styles.colQuantity}>{item.quantity}</td>
                                                            <td className={styles.colUnit}>{item.quantity_reserved || 0}</td>
                                                            <td className={styles.colStatus}>
                                                                <div className={styles.prepStatusWrapper}>
                                                                    <div className={cn(styles.badge, item.is_prepared ? styles.badgeSuccess : (item.is_backordered ? styles.badgeError : styles.badgeWarning))}>
                                                                        {item.is_prepared ? (
                                                                            <>
                                                                                <CheckCircle2 size={14} />
                                                                                <span>Done</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                {item.is_backordered ? <AlertCircle size={14} className={styles.errorIcon} /> : <Clock size={14} className={styles.cautionIcon} />}
                                                                                <span>{item.is_backordered ? 'Awaiting Production' : 'Pending Manual Reservation'}</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            {isPreparing ? (
                                <>
                                    <button 
                                        className={styles.secondaryButton} 
                                        onClick={() => setIsPreparing(false)}
                                    >
                                        Back to Details
                                    </button>
                                    <button 
                                        className={styles.primaryButton} 
                                        onClick={handleExecutePreparation}
                                        disabled={prepareMutation.isPending || selectedPrepItems.every(i => i.quantity <= 0)}
                                    >
                                        {prepareMutation.isPending ? (
                                            <>
                                                <Loader2 size={18} className={styles.spinner} />
                                                <span>Reserving...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Package size={16} />
                                                <span>Reserve & Forward to Dispatch</span>
                                            </>
                                        )}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className={styles.secondaryButton} onClick={() => setViewOrder(null)}>
                                        Close
                                    </button>
                                    {(viewOrder.status === 'pending' || viewOrder.status === 'reserved') && (
                                        <button 
                                            className={styles.primaryButton} 
                                            onClick={handleStartPreparation}
                                            disabled={getEligiblePrepItems(viewOrder).length === 0}
                                        >
                                            <ClipboardList size={16} />
                                            <span>Start Order Preparation</span>
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
