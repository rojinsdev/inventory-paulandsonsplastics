'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Loader2, Truck, CheckCircle, Clock, Package, X, DollarSign, Percent, Calendar } from 'lucide-react';
import { ordersAPI, customersAPI, productsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatDate, cn } from '@/lib/utils';
import styles from './page.module.css';

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
        queryKey: ['orders', { status: 'reserved' }],
        queryFn: () => ordersAPI.getAll({ status: 'reserved' }).then(res => res?.orders || res?.data || (Array.isArray(res) ? res : [])),
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
        const items = order.sales_order_items.map(item => ({
            item_id: item.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_type: item.unit_type,
            unit_price: item.unit_price || getProductPrice(item.product_id)
        }));
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

    // Calculate totals
    const calculations = useMemo(() => {
        const subtotal = deliveryForm.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
        let discountAmount = 0;
        if (deliveryForm.discount_value > 0) {
            if (deliveryForm.discount_type === 'percentage') {
                discountAmount = (subtotal * deliveryForm.discount_value) / 100;
            } else {
                discountAmount = deliveryForm.discount_value;
            }
        }
        const total = subtotal - discountAmount;
        const balance = total - (deliveryForm.initial_payment || 0);

        return { subtotal, discountAmount, total, balance };
    }, [deliveryForm]);

    const handleSubmitDelivery = () => {
        if (deliveryForm.payment_mode === 'credit' && !deliveryForm.credit_deadline) {
            alert('Please set a credit deadline');
            return;
        }

        const payload = {
            items: deliveryForm.items.map(item => ({
                item_id: item.item_id,
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

        deliveryMutation.mutate({ orderId: selectedOrder.id, data: payload });
    };

    const pendingCount = orders.length;
    const totalItems = orders.reduce(
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
                ) : orders.length === 0 ? (
                    <div className="empty-state">
                        <Truck size={48} />
                        <p>No pending deliveries</p>
                        <p className="text-muted">Reserved orders appear here for delivery processing</p>
                    </div>
                ) : (
                    <div className={styles.deliveryList}>
                        {orders.map((order) => (
                            <div key={order.id} className={styles.deliveryCard}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <div className={styles.orderId}>
                                            Order #{order.id?.slice(-6).toUpperCase()}
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
                                            <span className={styles.itemProduct}>
                                                {getProductName(item.product_id)}
                                            </span>
                                            <span className={styles.itemQty}>{item.quantity} {item.unit_type === 'bundle' ? 'Tub' : item.unit_type}{item.quantity > 1 ? 's' : ''}</span>
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
                <div className={styles.modalOverlay} onClick={() => setShowDeliveryModal(false)}>
                    <div className={styles.deliveryModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.modalTitle}>Process Delivery</h2>
                                <p className={styles.modalSubtitle}>
                                    Order #{selectedOrder.id?.slice(-6).toUpperCase()} - {getCustomerName(selectedOrder.customer_id)}
                                </p>
                            </div>
                            <button className={styles.closeButton} onClick={() => setShowDeliveryModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            {/* Left Column - Pricing */}
                            <div className={styles.modalLeft}>
                                {/* Product Pricing */}
                                <div className={styles.section}>
                                    <h3 className={styles.sectionTitle}>Product Pricing</h3>
                                    <div className={styles.pricingTable}>
                                        <div className={styles.pricingHeader}>
                                            <span>Product</span>
                                            <span>Quantity</span>
                                            <span>Unit Price</span>
                                            <span>Total</span>
                                        </div>
                                        {deliveryForm.items.map((item) => (
                                            <div key={item.item_id} className={styles.pricingRow}>
                                                <span className={styles.productName}>{getProductName(item.product_id)}</span>
                                                <span className={styles.quantity}>{item.quantity} {item.unit_type === 'bundle' ? 'Tub' : item.unit_type}{item.quantity > 1 ? 's' : ''}</span>
                                                <div className={styles.prefixWrapper}>
                                                    <input
                                                        type="number"
                                                        className={styles.priceInput}
                                                        value={item.unit_price}
                                                        onChange={(e) => handleItemPriceChange(item.item_id, e.target.value)}
                                                        step="0.01"
                                                        min="0"
                                                    />
                                                </div>
                                                <span className={styles.itemTotal}>₹{(item.unit_price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Discount */}
                                <div className={styles.section}>
                                    <h3 className={styles.sectionTitle}>Discount (Optional)</h3>
                                    <div className={styles.discountRow}>
                                        <div className={styles.discountToggle}>
                                            <button
                                                className={cn(styles.toggleButton, deliveryForm.discount_type === 'percentage' && styles.active)}
                                                onClick={() => setDeliveryForm(prev => ({ ...prev, discount_type: 'percentage' }))}
                                            >
                                                <Percent size={16} />
                                                Percentage
                                            </button>
                                            <button
                                                className={cn(styles.toggleButton, deliveryForm.discount_type === 'fixed' && styles.active)}
                                                onClick={() => setDeliveryForm(prev => ({ ...prev, discount_type: 'fixed' }))}
                                            >
                                                <DollarSign size={16} />
                                                Fixed Amount
                                            </button>
                                        </div>
                                        <div className={styles.prefixWrapper} style={deliveryForm.discount_type === 'percentage' ? { '--prefix': '"%"' } : {}}>
                                            <input
                                                type="number"
                                                className={styles.discountInput}
                                                placeholder={deliveryForm.discount_type === 'percentage' ? 'Enter %' : 'Enter amount'}
                                                value={deliveryForm.discount_value}
                                                onChange={(e) => setDeliveryForm(prev => ({ ...prev, discount_value: parseFloat(e.target.value) || 0 }))}
                                                step="0.01"
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Payment Details */}
                                <div className={styles.section}>
                                    <h3 className={styles.sectionTitle}>Payment Details</h3>
                                    <div className={styles.paymentMode}>
                                        <label className={styles.radioLabel}>
                                            <input
                                                type="radio"
                                                name="payment_mode"
                                                value="cash"
                                                checked={deliveryForm.payment_mode === 'cash'}
                                                onChange={(e) => setDeliveryForm(prev => ({ ...prev, payment_mode: e.target.value }))}
                                            />
                                            <span>Cash Payment</span>
                                        </label>
                                        <label className={styles.radioLabel}>
                                            <input
                                                type="radio"
                                                name="payment_mode"
                                                value="credit"
                                                checked={deliveryForm.payment_mode === 'credit'}
                                                onChange={(e) => setDeliveryForm(prev => ({ ...prev, payment_mode: e.target.value }))}
                                            />
                                            <span>Credit Payment</span>
                                        </label>
                                    </div>

                                    {deliveryForm.payment_mode === 'credit' && (
                                        <div className={styles.creditFields}>
                                            <label className={styles.fieldLabel}>
                                                <Calendar size={16} />
                                                Credit Deadline
                                                <input
                                                    type="date"
                                                    className={styles.dateInput}
                                                    value={deliveryForm.credit_deadline}
                                                    onChange={(e) => setDeliveryForm(prev => ({ ...prev, credit_deadline: e.target.value }))}
                                                    min={new Date().toISOString().split('T')[0]}
                                                />
                                            </label>
                                        </div>
                                    )}

                                    <div className={styles.paymentFields}>
                                        <label className={styles.fieldLabel}>
                                            Initial Payment
                                            <div className={styles.prefixWrapper}>
                                                <input
                                                    type="number"
                                                    className={styles.input}
                                                    placeholder="Enter amount"
                                                    value={deliveryForm.initial_payment}
                                                    onChange={(e) => setDeliveryForm(prev => ({ ...prev, initial_payment: parseFloat(e.target.value) || 0 }))}
                                                    step="0.01"
                                                    min="0"
                                                    max={calculations.total}
                                                />
                                            </div>
                                        </label>
                                        <label className={styles.fieldLabel}>
                                            Payment Method
                                            <select
                                                className={styles.select}
                                                value={deliveryForm.payment_method}
                                                onChange={(e) => setDeliveryForm(prev => ({ ...prev, payment_method: e.target.value }))}
                                            >
                                                <option value="Cash">Cash</option>
                                                <option value="Bank Transfer">Bank Transfer</option>
                                                <option value="Cheque">Cheque</option>
                                                <option value="UPI">UPI</option>
                                            </select>
                                        </label>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className={styles.section}>
                                    <label className={styles.fieldLabel}>
                                        Notes (Optional)
                                        <textarea
                                            className={styles.textarea}
                                            rows={3}
                                            placeholder="Add any delivery notes..."
                                            value={deliveryForm.notes}
                                            onChange={(e) => setDeliveryForm(prev => ({ ...prev, notes: e.target.value }))}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Right Column - Summary */}
                            <div className={styles.modalRight}>
                                <div className={styles.summaryCard}>
                                    <h3 className={styles.summaryTitle}>Order Summary</h3>
                                    <div className={styles.summaryRow}>
                                        <span>Subtotal</span>
                                        <span>₹{calculations.subtotal.toFixed(2)}</span>
                                    </div>
                                    {calculations.discountAmount > 0 && (
                                        <div className={cn(styles.summaryRow, styles.discount)}>
                                            <span>Discount ({deliveryForm.discount_type === 'percentage' ? `${deliveryForm.discount_value}%` : 'Fixed'})</span>
                                            <span>-₹{calculations.discountAmount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className={cn(styles.summaryRow, styles.total)}>
                                        <span>Total Amount</span>
                                        <span>₹{calculations.total.toFixed(2)}</span>
                                    </div>
                                    {deliveryForm.initial_payment > 0 && (
                                        <>
                                            <div className={styles.summaryRow}>
                                                <span>Amount Paid</span>
                                                <span>₹{deliveryForm.initial_payment.toFixed(2)}</span>
                                            </div>
                                            <div className={cn(styles.summaryRow, styles.balance)}>
                                                <span>Balance Due</span>
                                                <span>₹{calculations.balance.toFixed(2)}</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    className={styles.submitButton}
                                    onClick={handleSubmitDelivery}
                                    disabled={deliveryMutation.isPending}
                                >
                                    {deliveryMutation.isPending ? (
                                        <>
                                            <Loader2 size={18} className={styles.spinner} />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={18} />
                                            Confirm Delivery
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
