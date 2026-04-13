'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Loader2, Truck, CheckCircle, Clock, Package, X, IndianRupee, Percent, Calendar } from 'lucide-react';
import { ordersAPI, customersAPI, productsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatDate, cn, formatCurrency } from '@/lib/utils';
import styles from './page.module.css';

/** Units still deliverable on a line (prepared − shipped, or reserved − shipped when marked prepared but quantity_prepared not updated). */
function dispatchableRemaining(item) {
    const shipped = Number(item.quantity_shipped) || 0;
    const prep = Number(item.quantity_prepared) || 0;
    const res = Number(item.quantity_reserved) || 0;
    const fromPrep = prep - shipped;
    if (fromPrep > 0) return fromPrep;
    if (item.is_prepared && res > shipped) return res - shipped;
    return 0;
}

export default function DeliveriesPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const queryClient = useQueryClient();

    // Modal state
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [deliveryForm, setDeliveryForm] = useState({
        items: [],
        discount_type: 'percentage',
        discount_value: 0,
        payment_mode: 'cash',
        credit_deadline: '',
        initial_payment: 0,
        payment_method: 'Cash',
        notes: ''
    });

    // Queries
    const { data: orders = [], isLoading: ordersLoading, error: ordersError } = useQuery({
        queryKey: ['orders', { status: 'reserved,partially_delivered' }],
        queryFn: () => ordersAPI.getAll({ status: 'reserved,partially_delivered' }).then(res => res?.orders || res?.data || (Array.isArray(res) ? res : [])),
    });

    const { data: customers = [], isLoading: customersLoading } = useQuery({
        queryKey: ['customers'],
        queryFn: () => customersAPI.getAll().then(res => res?.customers || res?.data || (Array.isArray(res) ? res : [])),
    });

    const { data: products = [], isLoading: productsLoading } = useQuery({
        queryKey: ['products'],
        queryFn: () => productsAPI.getAll().then(res => res?.products || res?.data || (Array.isArray(res) ? res : [])),
    });

    // Mutation for processing delivery
    const deliveryMutation = useMutation({
        mutationFn: ({ orderId, data }) => ordersAPI.processDelivery(orderId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            setShowDeliveryModal(false);
            setSelectedOrder(null);
        },
        onError: (err) => {
            alert('Error: ' + err.message);
        }
    });

    useEffect(() => {
        setPageTitle('Deliveries');
        registerGuide({
            title: "Delivery Management",
            description: "Final stage of the sales pipeline: Process delivery with pricing and payment details.",
            logic: [
                {
                    title: "Payment Processing",
                    explanation: "Enter product prices, apply discounts, and record initial payments during delivery."
                },
                {
                    title: "Credit Management",
                    explanation: "Track credit payments with deadlines and partial payment support."
                }
            ],
            components: [
                {
                    name: "Process Delivery Modal",
                    description: "Comprehensive form for pricing, discounts, and payment entry."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);

    const loading = ordersLoading || customersLoading || productsLoading;
    const error = ordersError?.message;

    const getCustomerName = (id) => customers.find((c) => c.id === id)?.name || 'Unknown';
    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size})` : 'Unknown';
    };
    const getProductPrice = (id) => {
        const p = products.find((p) => p.id === id);
        return p?.selling_price || 0;
    };

    const handleOpenDeliveryModal = (order) => {
        setSelectedOrder(order);
        // Initialize form with product prices
        const items = order.sales_order_items.map(item => {
            const maxDispatch = dispatchableRemaining(item);
            return {
                item_id: item.id,
                product_id: item.product_id,
                quantity: item.quantity,
                quantity_prepared: item.quantity_prepared || 0,
                quantity_reserved: item.quantity_reserved || 0,
                quantity_shipped: item.quantity_shipped || 0,
                is_prepared: item.is_prepared,
                max_dispatch: maxDispatch,
                dispatch_quantity: maxDispatch,
                unit_type: item.unit_type,
                unit_price: item.unit_price || getProductPrice(item.product_id)
            };
        });
        setDeliveryForm({
            items,
            discount_type: 'percentage',
            discount_value: 0,
            payment_mode: 'cash',
            credit_deadline: '',
            initial_payment: 0,
            payment_method: 'Cash',
            notes: order.notes || ''
        });
        setShowDeliveryModal(true);
    };

    const handleItemPriceChange = (itemId, newPrice) => {
        setDeliveryForm(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.item_id === itemId ? { ...item, unit_price: parseFloat(newPrice) || 0 } : item
            )
        }));
    };

    const handleItemDispatchQuantityChange = (itemId, newQty) => {
        setDeliveryForm(prev => ({
            ...prev,
            items: prev.items.map(item => {
                if (item.item_id === itemId) {
                    const qty = parseInt(newQty) || 0;
                    const max = item.max_dispatch ?? dispatchableRemaining(item);
                    return { ...item, dispatch_quantity: Math.min(Math.max(0, qty), max) };
                }
                return item;
            })
        }));
    };

    // Lines ready to dispatch: prepared − shipped, or (when RPC left quantity_prepared at 0) reserved − shipped on prepared lines
    const displayOrders = useMemo(() => {
        if (!orders) return [];
        return orders.filter(order =>
            order.sales_order_items?.some(item => dispatchableRemaining(item) > 0)
        );
    }, [orders]);

    // Calculate totals
    const calculations = useMemo(() => {
        const subtotal = deliveryForm.items.reduce((sum, item) => sum + (item.unit_price * (item.dispatch_quantity || 0)), 0);
        let discountAmount = 0;
        if (deliveryForm.discount_value > 0) {
            if (deliveryForm.discount_type === 'percentage') {
                discountAmount = (subtotal * deliveryForm.discount_value) / 100;
            } else {
                discountAmount = deliveryForm.discount_value;
            }
        }
        const total = subtotal - discountAmount;
        const balance = total - (Number(deliveryForm.initial_payment) || 0);

        return { subtotal, discountAmount, total, balance };
    }, [deliveryForm]);

    const handleSubmitDelivery = () => {
        if (deliveryForm.payment_mode === 'credit' && !deliveryForm.credit_deadline) {
            alert('Please set a credit deadline');
            return;
        }

        const payload = {
            items: deliveryForm.items.filter(item => (item.dispatch_quantity || 0) > 0).map(item => ({
                item_id: item.item_id,
                quantity: item.dispatch_quantity,
                unit_price: item.unit_price
            })),
            discount_type: deliveryForm.discount_value > 0 ? deliveryForm.discount_type : undefined,
            discount_value: deliveryForm.discount_value > 0 ? deliveryForm.discount_value : undefined,
            payment_mode: deliveryForm.payment_mode,
            credit_deadline: deliveryForm.payment_mode === 'credit' ? deliveryForm.credit_deadline : undefined,
            initial_payment: deliveryForm.initial_payment || 0,
            payment_method: deliveryForm.payment_method,
            notes: deliveryForm.notes
        };

        if (payload.items.length === 0) {
            alert('Please specify at least one item to dispatch');
            return;
        }

        deliveryMutation.mutate({ orderId: selectedOrder.id, data: payload });
    };

    const pendingCount = displayOrders.length;
    const totalItems = displayOrders.reduce(
        (sum, order) => sum + (order.sales_order_items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0),
        0
    );

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Deliveries</h1>
                    <p className={styles.pageDescription}>
                        Reserved orders ready for delivery processing
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Clock size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{pendingCount}</div>
                        <div className={styles.statLabel}>Pending Deliveries</div>
                        <div className={styles.statSublabel}>Awaiting processing</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{totalItems}</div>
                        <div className={styles.statLabel}>Total Items to Deliver</div>
                        <div className={styles.statSublabel}>Across all units</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading deliveries...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>Error: {error}</p>
                        <button className="btn btn-secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}>
                            Retry
                        </button>
                    </div>
                ) : displayOrders.length === 0 ? (
                    <div className="empty-state">
                        <Truck size={48} />
                        <p>No pending deliveries</p>
                        <p className="text-muted">Reserved orders appear here for delivery processing</p>
                    </div>
                ) : (
                    <div className={styles.deliveryList}>
                        {displayOrders.map((order) => (
                            <div key={order.id} className={styles.deliveryCard}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <div className={styles.orderIdRow}>
                                            <span className={styles.orderId}>
                                                Order #{order.id?.slice(-6).toUpperCase()}
                                            </span>
                                            <span className={cn(styles.statusBadge, styles[order.status])}>
                                                {order.status === 'partially_delivered' ? 'Partial' : order.status}
                                            </span>
                                        </div>
                                        <div className={styles.customerName}>
                                            {getCustomerName(order.customer_id)}
                                        </div>
                                    </div>
                                    <div className={styles.orderDate}>{formatDate(order.created_at)}</div>
                                </div>

                                <div className={styles.itemsList}>
                                    {order.sales_order_items?.map((item, idx) => (
                                        <div key={idx} className={styles.itemRow}>
                                            <div className={styles.itemMain}>
                                                <span className={styles.itemProduct}>
                                                    {getProductName(item.product_id)}
                                                </span>
                                                <span className={styles.itemQty}>{item.quantity} {item.unit_type}</span>
                                            </div>
                                            <div className={styles.itemStatus}>
                                                <span className={styles.shippedQty}>Shipped: {item.quantity_shipped || 0}</span>
                                                <span className={styles.prepQty}>
                                                    Prep: {item.quantity_prepared || 0}
                                                    {(item.quantity_reserved || 0) > 0 && (
                                                        <> · Res: {item.quantity_reserved}</>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.cardFooter}>
                                    <div className={styles.totalBundles}>
                                        Total Items: {order.sales_order_items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0}
                                    </div>
                                    <button
                                        className={styles.deliverButton}
                                        onClick={() => handleOpenDeliveryModal(order)}
                                    >
                                        <CheckCircle size={16} />
                                        Process Delivery
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Process Delivery Modal */}
            {showDeliveryModal && selectedOrder && (
                <div
                    className={styles.modalOverlay}
                    onClick={() => setShowDeliveryModal(false)}
                    role="presentation"
                >
                    <div
                        className={styles.deliveryModal}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-labelledby="delivery-modal-title"
                        aria-modal="true"
                    >
                        <div className={styles.modalHeader}>
                            <div className={styles.modalHeaderMain}>
                                <div className={styles.modalIconWrap} aria-hidden>
                                    <Truck size={22} strokeWidth={1.75} />
                                </div>
                                <div>
                                    <h2 id="delivery-modal-title" className={styles.modalTitle}>
                                        Process delivery
                                    </h2>
                                    <div className={styles.modalMetaRow}>
                                        <span className={styles.orderBadge}>
                                            #{selectedOrder.id?.slice(-6).toUpperCase()}
                                        </span>
                                        <span className={styles.modalMetaDot} aria-hidden>
                                            ·
                                        </span>
                                        <span className={styles.modalCustomer}>
                                            {getCustomerName(selectedOrder.customer_id)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className={styles.closeButton}
                                onClick={() => setShowDeliveryModal(false)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.modalLeft}>
                                <div className={styles.section}>
                                    <div className={styles.sectionHead}>
                                        <h3 className={styles.sectionTitle}>Line items &amp; pricing</h3>
                                        <p className={styles.sectionHint}>
                                            Confirm dispatch quantities and unit prices before payment.
                                        </p>
                                    </div>
                                    <div className={styles.lineItemsScroll}>
                                        <div className={styles.pricingTable}>
                                            <div className={styles.pricingHeader}>
                                                <span>Product</span>
                                                <span>Order / prep</span>
                                                <span>Dispatch</span>
                                                <span>Unit price</span>
                                                <span className={styles.pricingHeadNum}>Line total</span>
                                            </div>
                                            {deliveryForm.items.map((item) => (
                                                <div key={item.item_id} className={styles.pricingRow}>
                                                    <div className={styles.productInfo}>
                                                        <span className={styles.cellLabel}>Product</span>
                                                        <span className={styles.productName}>
                                                            {getProductName(item.product_id)}
                                                        </span>
                                                        <span className={styles.productMeta}>{item.unit_type}</span>
                                                    </div>
                                                    <div className={styles.qtyStats}>
                                                        <span className={styles.cellLabel}>Order / prep</span>
                                                        <span className={styles.orderQty}>Ord: {item.quantity}</span>
                                                        <span className={styles.prepQty}>
                                                            Prep: {item.quantity_prepared}
                                                            {(item.quantity_reserved || 0) > 0 && (
                                                                <> · Res: {item.quantity_reserved}</>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className={styles.dispatchQty}>
                                                        <span className={styles.cellLabel}>Dispatch qty</span>
                                                        <input
                                                            type="number"
                                                            className={styles.qtyInput}
                                                            value={item.dispatch_quantity}
                                                            onChange={(e) =>
                                                                handleItemDispatchQuantityChange(
                                                                    item.item_id,
                                                                    e.target.value
                                                                )
                                                            }
                                                            min="0"
                                                            max={item.max_dispatch ?? 0}
                                                            aria-label="Dispatch quantity"
                                                        />
                                                    </div>
                                                    <div className={styles.priceCell}>
                                                        <span className={styles.cellLabel}>Unit price</span>
                                                        <div className={styles.prefixWrapper}>
                                                            <input
                                                                type="number"
                                                                className={styles.priceInput}
                                                                value={item.unit_price}
                                                                onChange={(e) =>
                                                                    handleItemPriceChange(item.item_id, e.target.value)
                                                                }
                                                                step="0.01"
                                                                min="0"
                                                                aria-label="Unit price"
                                                            />
                                                        </div>
                                                    </div>
                                                    <span className={styles.itemTotal}>
                                                        <span className={styles.cellLabel}>Line total</span>
                                                        <span className={styles.itemTotalValue}>
                                                            {formatCurrency(item.unit_price * item.dispatch_quantity)}
                                                        </span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.section}>
                                    <div className={styles.sectionHead}>
                                        <h3 className={styles.sectionTitle}>Discount (optional)</h3>
                                        <p className={styles.sectionHint}>Apply before totals on the right.</p>
                                    </div>
                                    <div className={styles.discountRow}>
                                        <div className={styles.discountToggle} role="group" aria-label="Discount type">
                                            <button
                                                type="button"
                                                className={cn(
                                                    styles.toggleButton,
                                                    deliveryForm.discount_type === 'percentage' && styles.active
                                                )}
                                                onClick={() =>
                                                    setDeliveryForm((prev) => ({
                                                        ...prev,
                                                        discount_type: 'percentage'
                                                    }))
                                                }
                                            >
                                                <Percent size={16} strokeWidth={2} />
                                                Percentage
                                            </button>
                                            <button
                                                type="button"
                                                className={cn(
                                                    styles.toggleButton,
                                                    deliveryForm.discount_type === 'fixed' && styles.active
                                                )}
                                                onClick={() =>
                                                    setDeliveryForm((prev) => ({ ...prev, discount_type: 'fixed' }))
                                                }
                                            >
                                                <IndianRupee size={16} strokeWidth={2} />
                                                Fixed amount
                                            </button>
                                        </div>
                                        <div
                                            className={styles.discountValueWrap}
                                            style={
                                                deliveryForm.discount_type === 'percentage'
                                                    ? { '--prefix': '"%"' }
                                                    : {}
                                            }
                                        >
                                            <label className={styles.srOnly} htmlFor="delivery-discount-input">
                                                Discount value
                                            </label>
                                            <div className={styles.prefixWrapper}>
                                                <input
                                                    id="delivery-discount-input"
                                                    type="number"
                                                    className={styles.discountInput}
                                                    placeholder={
                                                        deliveryForm.discount_type === 'percentage'
                                                            ? 'e.g. 5'
                                                            : 'Amount'
                                                    }
                                                    value={deliveryForm.discount_value}
                                                    onChange={(e) =>
                                                        setDeliveryForm((prev) => ({
                                                            ...prev,
                                                            discount_value: parseFloat(e.target.value) || 0
                                                        }))
                                                    }
                                                    step="0.01"
                                                    min="0"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.section}>
                                    <div className={styles.sectionHead}>
                                        <h3 className={styles.sectionTitle}>Payment</h3>
                                        <p className={styles.sectionHint}>Terms and how the customer is paying.</p>
                                    </div>
                                    <div className={styles.paymentMode}>
                                        <label
                                            className={cn(
                                                styles.radioLabel,
                                                deliveryForm.payment_mode === 'cash' && styles.radioLabelChecked
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="payment_mode"
                                                value="cash"
                                                checked={deliveryForm.payment_mode === 'cash'}
                                                onChange={(e) =>
                                                    setDeliveryForm((prev) => ({
                                                        ...prev,
                                                        payment_mode: e.target.value
                                                    }))
                                                }
                                            />
                                            <span>Cash payment</span>
                                        </label>
                                        <label
                                            className={cn(
                                                styles.radioLabel,
                                                deliveryForm.payment_mode === 'credit' && styles.radioLabelChecked
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="payment_mode"
                                                value="credit"
                                                checked={deliveryForm.payment_mode === 'credit'}
                                                onChange={(e) =>
                                                    setDeliveryForm((prev) => ({
                                                        ...prev,
                                                        payment_mode: e.target.value
                                                    }))
                                                }
                                            />
                                            <span>Credit payment</span>
                                        </label>
                                    </div>

                                    {deliveryForm.payment_mode === 'credit' && (
                                        <div className={styles.creditFields}>
                                            <label className={styles.fieldLabel}>
                                                <span className={styles.fieldLabelText}>
                                                    <Calendar size={16} strokeWidth={2} aria-hidden />
                                                    Credit deadline
                                                </span>
                                                <input
                                                    type="date"
                                                    className={styles.dateInput}
                                                    value={deliveryForm.credit_deadline}
                                                    onChange={(e) =>
                                                        setDeliveryForm((prev) => ({
                                                            ...prev,
                                                            credit_deadline: e.target.value
                                                        }))
                                                    }
                                                    min={new Date().toISOString().split('T')[0]}
                                                />
                                            </label>
                                        </div>
                                    )}

                                    <div className={styles.paymentFields}>
                                        <label className={styles.fieldLabel}>
                                            <span className={styles.fieldLabelText}>Initial payment</span>
                                            <div className={styles.prefixWrapper}>
                                                <input
                                                    type="number"
                                                    className={styles.input}
                                                    placeholder="0.00"
                                                    value={deliveryForm.initial_payment}
                                                    onChange={(e) =>
                                                        setDeliveryForm((prev) => ({
                                                            ...prev,
                                                            initial_payment: parseFloat(e.target.value) || 0
                                                        }))
                                                    }
                                                    step="0.01"
                                                    min="0"
                                                    max={calculations.total}
                                                />
                                            </div>
                                        </label>
                                        <label className={styles.fieldLabel}>
                                            <span className={styles.fieldLabelText}>Payment method</span>
                                            <select
                                                className={styles.select}
                                                value={deliveryForm.payment_method}
                                                onChange={(e) =>
                                                    setDeliveryForm((prev) => ({
                                                        ...prev,
                                                        payment_method: e.target.value
                                                    }))
                                                }
                                            >
                                                <option value="Cash">Cash</option>
                                                <option value="Bank Transfer">Bank Transfer</option>
                                                <option value="Cheque">Cheque</option>
                                                <option value="UPI">UPI</option>
                                            </select>
                                        </label>
                                    </div>
                                </div>

                                <div className={styles.section}>
                                    <div className={styles.sectionHead}>
                                        <h3 className={styles.sectionTitle}>Notes (optional)</h3>
                                    </div>
                                    <label className={styles.fieldLabelFlat}>
                                        <textarea
                                            className={styles.textarea}
                                            rows={3}
                                            placeholder="Delivery notes for the record…"
                                            value={deliveryForm.notes}
                                            onChange={(e) =>
                                                setDeliveryForm((prev) => ({ ...prev, notes: e.target.value }))
                                            }
                                        />
                                    </label>
                                </div>
                            </div>

                            <aside className={styles.modalRight}>
                                <div className={styles.summaryCard}>
                                    <h3 className={styles.summaryTitle}>Summary</h3>
                                    <div className={styles.summaryBody}>
                                        <div className={styles.summaryRow}>
                                            <span>Subtotal</span>
                                            <span className={styles.summaryAmount}>
                                                {formatCurrency(calculations.subtotal)}
                                            </span>
                                        </div>
                                        {calculations.discountAmount > 0 && (
                                            <div className={cn(styles.summaryRow, styles.discount)}>
                                                <span>
                                                    Discount (
                                                    {deliveryForm.discount_type === 'percentage'
                                                        ? `${deliveryForm.discount_value}%`
                                                        : 'Fixed'}
                                                    )
                                                </span>
                                                <span className={styles.summaryAmount}>
                                                    −{formatCurrency(calculations.discountAmount)}
                                                </span>
                                            </div>
                                        )}
                                        <div className={cn(styles.summaryRow, styles.total)}>
                                            <span>Total</span>
                                            <span className={styles.summaryTotal}>
                                                {formatCurrency(calculations.total)}
                                            </span>
                                        </div>
                                        {deliveryForm.initial_payment > 0 && (
                                            <>
                                                <div className={styles.summaryRow}>
                                                    <span>Paid now</span>
                                                    <span className={styles.summaryAmount}>
                                                        {formatCurrency(deliveryForm.initial_payment)}
                                                    </span>
                                                </div>
                                                <div className={cn(styles.summaryRow, styles.balance)}>
                                                    <span>Balance due</span>
                                                    <span className={styles.summaryBalance}>
                                                        {formatCurrency(calculations.balance)}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className={styles.submitButton}
                                    onClick={handleSubmitDelivery}
                                    disabled={deliveryMutation.isPending}
                                >
                                    {deliveryMutation.isPending ? (
                                        <>
                                            <Loader2 size={18} className={styles.spinner} />
                                            Processing…
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={18} strokeWidth={2} />
                                            Confirm delivery
                                        </>
                                    )}
                                </button>
                            </aside>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
