'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useUI } from '@/contexts/UIContext';
import { ArrowLeft, TrendingUp, ShoppingCart, Calendar, Tag, Loader2, Plus, DollarSign, AlertCircle, X } from 'lucide-react';
import { customersAPI, ordersAPI } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import styles from './page.module.css';

export default function CustomerDetailPage() {
    const { setPageTitle } = useUI();
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const customerId = params.id;

    const [activeTab, setActiveTab] = useState('overview');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        payment_method: 'Cash',
        payment_date: new Date().toISOString().split('T')[0],
        notes: ''
    });

    // Query for customer profile
    const { data: profile, isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['customer', customerId],
        queryFn: () => customersAPI.getProfile(customerId),
        enabled: !!customerId,
    });

    // Query for payment history
    const { data: paymentHistory, isLoading: paymentsLoading } = useQuery({
        queryKey: ['customer-payments', customerId],
        queryFn: () => ordersAPI.getCustomerPaymentHistory(customerId),
        enabled: !!customerId,
    });

    // Mutation for recording payment
    const recordPaymentMutation = useMutation({
        mutationFn: ({ orderId, data }) => ordersAPI.recordPayment(orderId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['customer-payments', customerId]);
            queryClient.invalidateQueries(['customer', customerId]);
            queryClient.invalidateQueries(['pending-payments']);
            setShowPaymentModal(false);
            setSelectedOrder(null);
            setPaymentForm({
                amount: '',
                payment_method: 'Cash',
                payment_date: new Date().toISOString().split('T')[0],
                notes: ''
            });
        },
    });

    const error = queryError?.message;

    useEffect(() => {
        setPageTitle('Customer Profile');
    }, [setPageTitle]);



    if (loading) {
        return (
            <>
                <div className={styles.loading}>
                    <Loader2 size={32} className={styles.spinner} />
                    <p>Loading customer profile...</p>
                </div>
            </>
        );
    }

    if (error || (!loading && !profile)) {
        return (
            <>
                <div className={styles.error}>
                    <p>Error: {error || 'Customer not found'}</p>
                    <div className={styles.errorActions}>
                        <button className="btn btn-primary" onClick={() => refetch()}>
                            Retry
                        </button>
                        <button className="btn btn-secondary" onClick={() => router.push('/customers')}>
                            Back to Customers
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const { customer, analytics, recentOrders, recentInteractions } = profile;

    return (
        <div className={styles.contentWrapper}>
            <style jsx>{`
                .${styles.contentWrapper} {
                    padding: 0;
                }
            `}</style>
            {/* Header */}
            <div className={styles.header}>
                <button className={styles.backButton} onClick={() => router.push('/customers')}>
                    <ArrowLeft size={20} />
                    <span>Back to Customers</span>
                </button>

                <div className={styles.headerContent}>
                    <div>
                        <h1 className={styles.customerName}>{customer.name}</h1>
                        <div className={styles.customerMeta}>
                            {customer.phone && <span>{customer.phone}</span>}
                            {customer.email && <span>{customer.email}</span>}
                            {analytics && (
                                <span className={styles.segment} data-segment={analytics.customer_segment}>
                                    {analytics.customer_segment.toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            {analytics && (
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'var(--primary-light)' }}>
                            <ShoppingCart size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{analytics.total_orders}</div>
                            <div className={styles.statLabel}>Total Orders</div>
                            <div className={styles.statSublabel}>{analytics.delivered_orders} delivered</div>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'var(--success-light)' }}>
                            <TrendingUp size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{formatCurrency(analytics.total_purchase_value)}</div>
                            <div className={styles.statLabel}>Total Purchase Value</div>
                            <div className={styles.statSublabel}>Avg: {formatCurrency(analytics.average_order_value)}</div>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'var(--warning-light)' }}>
                            <Calendar size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>
                                {analytics.days_since_last_order !== null ? `${analytics.days_since_last_order}d` : 'N/A'}
                            </div>
                            <div className={styles.statLabel}>Days Since Last Order</div>
                            <div className={styles.statSublabel}>
                                {analytics.last_purchase_date ? formatDate(analytics.last_purchase_date) : 'No orders'}
                            </div>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'var(--info-light)' }}>
                            <Tag size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{analytics.most_purchased_product_quantity || 0}</div>
                            <div className={styles.statLabel}>Most Purchased Product</div>
                            <div className={styles.statSublabel}>
                                {analytics.most_purchased_product_name || 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'orders' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('orders')}
                >
                    Purchase History ({recentOrders?.length || 0})
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'payments' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('payments')}
                >
                    Payments & Credit
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'interactions' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('interactions')}
                >
                    Interactions ({recentInteractions?.length || 0})
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'profile' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('profile')}
                >
                    Profile Details
                </button>
            </div>

            {/* Tab Content */}
            <div className={styles.tabContent}>
                {activeTab === 'overview' && (
                    <div className={styles.overview}>
                        <div className={styles.overviewSection}>
                            <h3>Customer Information</h3>
                            <div className={styles.infoGrid}>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Customer Type</span>
                                    <span className={styles.infoValue}>{customer.type || 'N/A'}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Payment Terms</span>
                                    <span className={styles.infoValue}>{customer.payment_terms || 'N/A'}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Credit Limit</span>
                                    <span className={styles.infoValue}>{formatCurrency(customer.credit_limit || 0)}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>GST Number</span>
                                    <span className={styles.infoValue}>{customer.gstin || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {analytics && (
                            <div className={styles.overviewSection}>
                                <h3>Analytics Summary</h3>
                                <div className={styles.infoGrid}>
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>Customer Segment</span>
                                        <span className={styles.infoValue}>
                                            <span className={styles.segment} data-segment={analytics.customer_segment}>
                                                {analytics.customer_segment.toUpperCase()}
                                            </span>
                                        </span>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>Risk Level</span>
                                        <span className={styles.infoValue}>
                                            <span className={styles.riskBadge} data-risk={analytics.risk_level}>
                                                {analytics.risk_level.toUpperCase()}
                                            </span>
                                        </span>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>First Purchase</span>
                                        <span className={styles.infoValue}>
                                            {analytics.first_purchase_date ? formatDate(analytics.first_purchase_date) : 'N/A'}
                                        </span>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>Avg Days Between Orders</span>
                                        <span className={styles.infoValue}>
                                            {analytics.average_days_between_orders ? `${Math.round(analytics.average_days_between_orders)} days` : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {customer.notes && (
                            <div className={styles.overviewSection}>
                                <h3>Notes</h3>
                                <p className={styles.notes}>{customer.notes}</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'orders' && (
                    <div className={styles.ordersTab}>
                        <div className="card">
                            {recentOrders && recentOrders.length > 0 ? (
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Order Date</th>
                                            <th>Status</th>
                                            <th>Items</th>
                                            <th>Total Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentOrders.map((order) => (
                                            <tr key={order.id}>
                                                <td>{formatDate(order.order_date)}</td>
                                                <td>
                                                    <span className={`badge badge-${order.status}`}>
                                                        {order.status}
                                                    </span>
                                                </td>
                                                <td>{order.sales_order_items?.length || 0} items</td>
                                                <td className="font-medium">{formatCurrency(order.total_amount || 0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="empty-state">
                                    <ShoppingCart size={48} />
                                    <p>No orders yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'payments' && (
                    <div className={styles.paymentsTab}>
                        {paymentsLoading ? (
                            <div className={styles.loading}>
                                <Loader2 size={32} className={styles.spinner} />
                                <p>Loading payment history...</p>
                            </div>
                        ) : paymentHistory ? (
                            <>
                                {/* Outstanding Balance Summary */}
                                <div className={styles.paymentSummary}>
                                    <div className={styles.summaryCard}>
                                        <div className={styles.summaryIcon} style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                                            <TrendingUp size={24} />
                                        </div>
                                        <div>
                                            <div className={styles.summaryLabel}>Total Billed</div>
                                            <div className={styles.summaryValue}>{formatCurrency(paymentHistory.total_billed || 0)}</div>
                                        </div>
                                    </div>
                                    <div className={styles.summaryCard}>
                                        <div className={styles.summaryIcon} style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                                            <DollarSign size={24} />
                                        </div>
                                        <div>
                                            <div className={styles.summaryLabel}>Total Paid</div>
                                            <div className={styles.summaryValue}>{formatCurrency(paymentHistory.total_paid || 0)}</div>
                                        </div>
                                    </div>
                                    <div className={styles.summaryCard}>
                                        <div className={styles.summaryIcon} style={{ background: paymentHistory.outstanding_balance > 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                                            {paymentHistory.outstanding_balance > 0 ? <AlertCircle size={24} /> : <DollarSign size={24} />}
                                        </div>
                                        <div>
                                            <div className={styles.summaryLabel}>Outstanding Balance</div>
                                            <div className={styles.summaryValue} style={{ color: paymentHistory.outstanding_balance > 0 ? 'var(--warning)' : 'var(--success)' }}>
                                                {formatCurrency(paymentHistory.outstanding_balance || 0)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Outstanding Orders */}
                                {paymentHistory.orders_with_balance && paymentHistory.orders_with_balance.length > 0 && (
                                    <div className={styles.outstandingOrders}>
                                        <h3>Outstanding Orders</h3>
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Order #</th>
                                                    <th>Order Date</th>
                                                    <th>Total Amount</th>
                                                    <th>Amount Paid</th>
                                                    <th>Balance Due</th>
                                                    <th>Credit Deadline</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paymentHistory.orders_with_balance.map((order) => (
                                                    <tr key={order.id} className={order.is_overdue ? styles.overdueRow : ''}>
                                                        <td className={styles.orderNumber}>{order.order_number}</td>
                                                        <td>{formatDate(order.order_date)}</td>
                                                        <td>{formatCurrency(order.total_amount || 0)}</td>
                                                        <td>{formatCurrency(order.amount_paid || 0)}</td>
                                                        <td className={styles.balanceDue}>{formatCurrency(order.balance_due || 0)}</td>
                                                        <td>
                                                            {order.credit_deadline ? (
                                                                <span className={order.is_overdue ? styles.overdueDate : ''}>
                                                                    {formatDate(order.credit_deadline)}
                                                                    {order.is_overdue && ' (Overdue)'}
                                                                </span>
                                                            ) : 'N/A'}
                                                        </td>
                                                        <td>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedOrder(order);
                                                                    setPaymentForm({
                                                                        amount: order.balance_due || '',
                                                                        payment_method: 'Cash',
                                                                        payment_date: new Date().toISOString().split('T')[0],
                                                                        notes: ''
                                                                    });
                                                                    setShowPaymentModal(true);
                                                                }}
                                                                className={styles.recordButton}
                                                            >
                                                                <DollarSign size={14} />
                                                                Record Payment
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Payment History */}
                                {paymentHistory.payment_records && paymentHistory.payment_records.length > 0 && (
                                    <div className={styles.paymentHistorySection}>
                                        <h3>Payment History</h3>
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Order #</th>
                                                    <th>Amount</th>
                                                    <th>Payment Method</th>
                                                    <th>Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paymentHistory.payment_records.map((payment) => (
                                                    <tr key={payment.id}>
                                                        <td>{formatDate(payment.payment_date)}</td>
                                                        <td>{payment.order_number || 'N/A'}</td>
                                                        <td className={styles.paymentAmount}>{formatCurrency(payment.amount)}</td>
                                                        <td>{payment.payment_method}</td>
                                                        <td>{payment.notes || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {(!paymentHistory.orders_with_balance || paymentHistory.orders_with_balance.length === 0) &&
                                    (!paymentHistory.payment_records || paymentHistory.payment_records.length === 0) && (
                                        <div className="empty-state">
                                            <DollarSign size={48} />
                                            <p>No payment history available</p>
                                        </div>
                                    )}
                            </>
                        ) : (
                            <div className="empty-state">
                                <DollarSign size={48} />
                                <p>No payment data available</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'interactions' && (
                    <div className={styles.interactionsTab}>
                        <div className="card">
                            {recentInteractions && recentInteractions.length > 0 ? (
                                <div className={styles.timeline}>
                                    {recentInteractions.map((interaction) => (
                                        <div key={interaction.id} className={styles.timelineItem}>
                                            <div className={styles.timelineDot}></div>
                                            <div className={styles.timelineContent}>
                                                <div className={styles.timelineHeader}>
                                                    <span className={styles.interactionType}>
                                                        {interaction.interaction_type.replace('_', ' ')}
                                                    </span>
                                                    <span className={styles.timelineDate}>
                                                        {formatDate(interaction.created_at)}
                                                    </span>
                                                </div>
                                                {interaction.description && (
                                                    <p className={styles.timelineDescription}>{interaction.description}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <Calendar size={48} />
                                    <p>No interactions recorded</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className={styles.profileTab}>
                        <div className="card">
                            <h3>Contact Information</h3>
                            <div className={styles.profileGrid}>
                                <div className={styles.profileItem}>
                                    <label>Name</label>
                                    <p>{customer.name}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Phone</label>
                                    <p>{customer.phone || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Email</label>
                                    <p>{customer.email || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Address</label>
                                    <p>{customer.address || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>City</label>
                                    <p>{customer.city || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>State</label>
                                    <p>{customer.state || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Pincode</label>
                                    <p>{customer.pincode || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>GST Number</label>
                                    <p>{customer.gstin || '—'}</p>
                                </div>
                            </div>

                            <h3 style={{ marginTop: '2rem' }}>Business Details</h3>
                            <div className={styles.profileGrid}>
                                <div className={styles.profileItem}>
                                    <label>Customer Type</label>
                                    <p>{customer.type || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Payment Terms</label>
                                    <p>{customer.payment_terms || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Credit Limit</label>
                                    <p>{formatCurrency(customer.credit_limit || 0)}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Status</label>
                                    <p>{customer.is_active ? 'Active' : 'Inactive'}</p>
                                </div>
                            </div>

                            {customer.tags && customer.tags.length > 0 && (
                                <>
                                    <h3 style={{ marginTop: '2rem' }}>Tags</h3>
                                    <div className={styles.tags}>
                                        {customer.tags.map((tag, index) => (
                                            <span key={index} className={styles.tag}>{tag}</span>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {showPaymentModal && selectedOrder && (
                <div className={styles.modalOverlay} onClick={() => setShowPaymentModal(false)}>
                    <div className={styles.paymentModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.modalTitle}>Record Payment</h2>
                                <p className={styles.modalSubtitle}>
                                    Order #{selectedOrder.order_number}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className={styles.closeButton}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const amount = parseFloat(paymentForm.amount);
                            if (amount <= 0 || amount > parseFloat(selectedOrder.balance_due)) {
                                alert('Invalid payment amount');
                                return;
                            }
                            recordPaymentMutation.mutate({
                                orderId: selectedOrder.id,
                                data: {
                                    amount,
                                    payment_method: paymentForm.payment_method,
                                    payment_date: paymentForm.payment_date,
                                    notes: paymentForm.notes
                                }
                            });
                        }} className={styles.modalBody}>
                            <div className={styles.summarySection}>
                                <div className={styles.summaryRow}>
                                    <span>Total Amount:</span>
                                    <span>{formatCurrency(selectedOrder.total_amount || 0)}</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>Already Paid:</span>
                                    <span>{formatCurrency(selectedOrder.amount_paid || 0)}</span>
                                </div>
                                <div className={`${styles.summaryRow} ${styles.balanceRow}`}>
                                    <span>Balance Due:</span>
                                    <span>{formatCurrency(selectedOrder.balance_due || 0)}</span>
                                </div>
                            </div>

                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>Payment Amount *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        max={selectedOrder.balance_due}
                                        value={paymentForm.amount}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                        className={styles.input}
                                        required
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Payment Method *</label>
                                    <select
                                        value={paymentForm.payment_method}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                                        className={styles.select}
                                        required
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                        <option value="Cheque">Cheque</option>
                                        <option value="UPI">UPI</option>
                                    </select>
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Payment Date *</label>
                                    <input
                                        type="date"
                                        value={paymentForm.payment_date}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                                        className={styles.input}
                                        required
                                    />
                                </div>

                                <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                                    <label>Notes</label>
                                    <textarea
                                        value={paymentForm.notes}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                        className={styles.textarea}
                                        rows="3"
                                        placeholder="Add any notes about this payment..."
                                    />
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    onClick={() => setShowPaymentModal(false)}
                                    className={styles.cancelButton}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={recordPaymentMutation.isPending}
                                >
                                    <DollarSign size={18} />
                                    {recordPaymentMutation.isPending ? 'Recording...' : 'Record Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
