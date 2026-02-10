'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersAPI, customersAPI } from '@/lib/api';
import {
    DollarSign, Search, Filter, Calendar, X,
    AlertCircle, CheckCircle2, Clock, TrendingUp
} from 'lucide-react';
import styles from './page.module.css';

export default function PaymentsPage() {
    const queryClient = useQueryClient();

    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all, pending, overdue
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        payment_method: 'Cash',
        payment_date: new Date().toISOString().split('T')[0],
        notes: ''
    });

    // Queries
    const { data: pendingOrders = [], isLoading: ordersLoading } = useQuery({
        queryKey: ['pending-payments', { status: statusFilter }],
        queryFn: () => {
            const params = {};
            if (statusFilter === 'overdue') params.is_overdue = true;
            else if (statusFilter === 'pending') params.balance_due_gt = 0;
            return ordersAPI.getPendingPayments(params);
        },
    });

    const { data: customers = [] } = useQuery({
        queryKey: ['customers'],
        queryFn: () => customersAPI.getAll(),
    });

    // Mutation for recording payment
    const recordPaymentMutation = useMutation({
        mutationFn: ({ orderId, data }) => ordersAPI.recordPayment(orderId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['pending-payments']);
            queryClient.invalidateQueries(['orders']);
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

    // Filter orders
    const filteredOrders = useMemo(() => {
        return pendingOrders.filter(order => {
            const matchesSearch = searchTerm === '' ||
                order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesCustomer = selectedCustomer === '' || order.customer_id === selectedCustomer;

            return matchesSearch && matchesCustomer;
        });
    }, [pendingOrders, searchTerm, selectedCustomer]);

    // Calculate summary stats
    const stats = useMemo(() => {
        const totalOutstanding = filteredOrders.reduce((sum, order) => sum + (parseFloat(order.balance_due) || 0), 0);
        const overdueCount = filteredOrders.filter(order => order.is_overdue).length;
        const totalOrders = filteredOrders.length;

        return { totalOutstanding, overdueCount, totalOrders };
    }, [filteredOrders]);

    const handleOpenPaymentModal = (order) => {
        setSelectedOrder(order);
        setPaymentForm({
            amount: order.balance_due || '',
            payment_method: 'Cash',
            payment_date: new Date().toISOString().split('T')[0],
            notes: ''
        });
        setShowPaymentModal(true);
    };

    const handleSubmitPayment = (e) => {
        e.preventDefault();

        if (!selectedOrder || !paymentForm.amount) return;

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
    };

    if (ordersLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    <p>Loading payments...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <DollarSign className={styles.headerIcon} size={32} />
                    <div>
                        <h1 className={styles.title}>Payments</h1>
                        <p className={styles.subtitle}>Manage pending payments and credit tracking</p>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <p className={styles.statLabel}>Total Outstanding</p>
                        <p className={styles.statValue}>₹{stats.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                        <Clock size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <p className={styles.statLabel}>Pending Orders</p>
                        <p className={styles.statValue}>{stats.totalOrders}</p>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}>
                        <AlertCircle size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <p className={styles.statLabel}>Overdue</p>
                        <p className={styles.statValue}>{stats.overdueCount}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                <div className={styles.searchBox}>
                    <Search size={20} />
                    <input
                        type="text"
                        placeholder="Search by order number or customer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>

                <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className={styles.filterSelect}
                >
                    <option value="">All Customers</option>
                    {customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                            {customer.name}
                        </option>
                    ))}
                </select>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={styles.filterSelect}
                >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="overdue">Overdue</option>
                </select>
            </div>

            {/* Payments Table */}
            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Order #</th>
                            <th>Customer</th>
                            <th>Order Date</th>
                            <th>Total Amount</th>
                            <th>Amount Paid</th>
                            <th>Balance Due</th>
                            <th>Credit Deadline</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan="9" className={styles.emptyState}>
                                    <CheckCircle2 size={48} />
                                    <p>No pending payments found</p>
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.map(order => (
                                <tr key={order.id} className={order.is_overdue ? styles.overdueRow : ''}>
                                    <td className={styles.orderNumber}>{order.order_number}</td>
                                    <td>{order.customer?.name || 'N/A'}</td>
                                    <td>{new Date(order.order_date).toLocaleDateString('en-IN')}</td>
                                    <td>₹{parseFloat(order.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td>₹{parseFloat(order.amount_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className={styles.balanceDue}>
                                        ₹{parseFloat(order.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td>
                                        {order.credit_deadline
                                            ? new Date(order.credit_deadline).toLocaleDateString('en-IN')
                                            : 'N/A'
                                        }
                                    </td>
                                    <td>
                                        {order.is_overdue ? (
                                            <span className={styles.statusBadge} data-status="overdue">
                                                <AlertCircle size={14} />
                                                Overdue
                                            </span>
                                        ) : (
                                            <span className={styles.statusBadge} data-status="pending">
                                                <Clock size={14} />
                                                Pending
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => handleOpenPaymentModal(order)}
                                            className={styles.recordButton}
                                        >
                                            <DollarSign size={16} />
                                            Record Payment
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Payment Modal */}
            {showPaymentModal && selectedOrder && (
                <div className={styles.modalOverlay} onClick={() => setShowPaymentModal(false)}>
                    <div className={styles.paymentModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.modalTitle}>Record Payment</h2>
                                <p className={styles.modalSubtitle}>
                                    Order #{selectedOrder.order_number} - {selectedOrder.customer?.name}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className={styles.closeButton}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitPayment} className={styles.modalBody}>
                            <div className={styles.summarySection}>
                                <div className={styles.summaryRow}>
                                    <span>Total Amount:</span>
                                    <span>₹{parseFloat(selectedOrder.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>Already Paid:</span>
                                    <span>₹{parseFloat(selectedOrder.amount_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className={`${styles.summaryRow} ${styles.balanceRow}`}>
                                    <span>Balance Due:</span>
                                    <span>₹{parseFloat(selectedOrder.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
