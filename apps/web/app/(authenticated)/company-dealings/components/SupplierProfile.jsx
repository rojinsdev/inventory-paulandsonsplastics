'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    ArrowLeft, 
    Phone, 
    Mail, 
    MapPin, 
    IndianRupee, 
    Loader2,
    Calendar,
    FileText,
    History,
    X,
    Briefcase,
    Package,
    ShieldCheck,
    CreditCard,
    Factory,
} from 'lucide-react';
import Link from 'next/link';
import { suppliersAPI, purchasesAPI } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useFactory } from '@/contexts/FactoryContext';
import styles from './SupplierProfile.module.css';

function defaultFactoryId(selectedFactory, factoriesList) {
    if (typeof selectedFactory === 'string' && selectedFactory) return selectedFactory;
    if (selectedFactory && typeof selectedFactory === 'object' && selectedFactory.id) return selectedFactory.id;
    return factoriesList?.[0]?.id || '';
}

export default function SupplierProfile({ supplierId }) {
    const { selectedFactory, factories } = useFactory();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('overview');
    const [recordPaymentModal, setRecordPaymentModal] = useState(false);
    const [paymentFormData, setPaymentFormData] = useState({
        factory_id: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_mode: 'Bank Transfer',
        notes: '',
    });

    // 1. Fetch Supplier Data
    const { data: supplier, isLoading: loadingSupplier, error: supplierError } = useQuery({
        queryKey: ['supplier', supplierId],
        queryFn: () => suppliersAPI.getById(supplierId),
    });

    // 2. Fetch Purchases
    const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
        queryKey: ['supplier-purchases', supplierId],
        queryFn: () => purchasesAPI.getAll({ supplier_id: supplierId }),
    });

    // 3. Fetch Payments
    const { data: payments = [], isLoading: loadingPayments } = useQuery({
        queryKey: ['supplier-payments', supplierId],
        queryFn: () => suppliersAPI.getPayments(supplierId),
    });

    // 4. Record Payment Mutation
    const paymentMutation = useMutation({
        mutationFn: (data) => suppliersAPI.recordPayment(supplierId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
            queryClient.invalidateQueries({ queryKey: ['supplier-payments', supplierId] });
            queryClient.invalidateQueries({ queryKey: ['supplier-purchases', supplierId] });
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            setRecordPaymentModal(false);
            setPaymentFormData({
                factory_id: defaultFactoryId(selectedFactory, factories),
                amount: '',
                payment_date: new Date().toISOString().split('T')[0],
                payment_mode: 'Bank Transfer',
                notes: '',
            });
        },
        onError: (err) => alert(err.message)
    });

    useEffect(() => {
        if (!recordPaymentModal) return;
        const def = defaultFactoryId(selectedFactory, factories);
        setPaymentFormData((prev) => ({
            ...prev,
            factory_id:
                prev.factory_id && factories?.some((f) => f.id === prev.factory_id) ? prev.factory_id : def,
        }));
    }, [recordPaymentModal, selectedFactory, factories]);

    const handleRecordPayment = (e) => {
        e.preventDefault();
        const factory_id = paymentFormData.factory_id || defaultFactoryId(selectedFactory, factories);
        if (!factory_id) {
            return alert('Select which factory this payment is for.');
        }
        paymentMutation.mutate({
            ...paymentFormData,
            amount: Number(paymentFormData.amount),
            factory_id,
        });
    };

    if (loadingSupplier) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spinner} size={48} />
                <p>Loading supplier details...</p>
            </div>
        );
    }

    if (supplierError) {
        return (
            <div className={styles.error}>
                <X className="text-red-500" size={48} />
                <p>Error loading supplier: {supplierError.message}</p>
            </div>
        );
    }

    if (!supplier) return <div className={styles.error}>Supplier not found.</div>;

    // Calculate Summary Stats
    const totalPurchased = purchases.reduce((sum, p) => sum + Number(p.total_amount), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const pendingBalance = Number(supplier.balance_due);

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Briefcase },
        { id: 'purchases', label: 'Purchases', icon: Package },
        { id: 'payments', label: 'Payments', icon: History },
        { id: 'profile', label: 'Profile', icon: FileText },
    ];

    return (
        <div className={styles.contentWrapper}>
            {/* Header */}
            <div className={styles.header}>
                <Link href="/company-dealings/suppliers" className={styles.backButton}>
                    <ArrowLeft size={16} />
                    Back to Suppliers
                </Link>
                
                <div className={styles.headerContent}>
                    <div>
                        <h1 className={styles.supplierName}>{supplier.name}</h1>
                        <div className={styles.supplierMeta}>
                            <span>Contact: {supplier.contact_person || 'N/A'}</span>
                            {supplier.gstin && <span className={styles.gstBadge}>GST: {supplier.gstin}</span>}
                        </div>
                    </div>
                    <button 
                        className={styles.recordButton}
                        onClick={() => setRecordPaymentModal(true)}
                    >
                        <IndianRupee size={18} />
                        Record Payment
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={cn(styles.statIcon, styles.iconPurchases)}>
                        <Package size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statLabel}>Total Purchases</div>
                        <div className={styles.statValue}>{formatCurrency(totalPurchased)}</div>
                        <div className={styles.statSublabel}>{purchases.length} orders total</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={cn(styles.statIcon, styles.iconValue)}>
                        <IndianRupee size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statLabel}>Total Paid</div>
                        <div className={styles.statValue}>{formatCurrency(totalPaid)}</div>
                        <div className={styles.statSublabel}>Lifetime payments</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={cn(styles.statIcon, styles.iconSettled)}>
                        <ShieldCheck size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statLabel}>Settled Amount</div>
                        <div className={styles.statValue}>{formatCurrency(totalPaid)}</div>
                        <div className={styles.statSublabel}>Fully reconciled</div>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={cn(styles.statIcon, styles.iconBalance)}>
                        <CreditCard size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statLabel}>Outstanding Balance</div>
                        <div className={cn(styles.statValue, pendingBalance > 0 ? "text-amber-500" : "text-green-500")}>
                            {formatCurrency(pendingBalance)}
                        </div>
                        <div className={styles.statSublabel}>Current credit due</div>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className={styles.tabs}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(styles.tab, activeTab === tab.id && styles.tabActive)}
                    >
                        <div className="flex items-center gap-2">
                            <tab.icon size={16} />
                            {tab.label}
                        </div>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className={styles.tabContent}>
                {activeTab === 'overview' && (
                    <div className={styles.overview}>
                        <div className={styles.sectionCard}>
                            <div className={styles.sectionHeader}>
                                <h3>Business Information</h3>
                            </div>
                            <div className={styles.infoGrid}>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>Phone</div>
                                    <div className={styles.infoValue}>{supplier.phone || 'Not provided'}</div>
                                </div>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>Email</div>
                                    <div className={styles.infoValue}>{supplier.email || 'Not provided'}</div>
                                </div>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>Primary Address</div>
                                    <div className={styles.infoValue}>{supplier.address || 'Not provided'}</div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.sectionCard}>
                            <div className={styles.sectionHeader}>
                                <h3>Recent Activity Summary</h3>
                                <button onClick={() => setActiveTab('purchases')} className={styles.viewAllLink}>
                                    View All Purchases
                                </button>
                            </div>
                            <div className={styles.tableContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Item Type</th>
                                            <th>Status</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purchases.slice(0, 5).map(purchase => (
                                            <tr key={purchase.id}>
                                                <td>{formatDate(purchase.purchase_date)}</td>
                                                <td>{purchase.item_type}</td>
                                                <td>
                                                    <span className={
                                                        purchase.payment_status === 'paid' ? styles.statusPaid : 
                                                        purchase.payment_status === 'partial' ? styles.statusPartial : styles.statusPending
                                                    }>
                                                        {purchase.payment_status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td>{formatCurrency(purchase.total_amount)}</td>
                                            </tr>
                                        ))}
                                        {purchases.length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="text-center p-8 text-muted">No recent purchases.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'purchases' && (
                    <div className={styles.sectionCard}>
                        <div className={styles.sectionHeader}>
                            <h3>All Purchase History</h3>
                        </div>
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Reference No.</th>
                                        <th>Item Type</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchases.map(purchase => (
                                        <tr key={purchase.id}>
                                            <td>{formatDate(purchase.purchase_date)}</td>
                                            <td className="font-mono text-xs">{purchase.id.split('-')[0]}</td>
                                            <td>{purchase.item_type}</td>
                                            <td className="font-semibold">{formatCurrency(purchase.total_amount)}</td>
                                            <td>
                                                <span className={
                                                    purchase.payment_status === 'paid' ? styles.statusPaid : 
                                                    purchase.payment_status === 'partial' ? styles.statusPartial : styles.statusPending
                                                }>
                                                    {purchase.payment_status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="text-muted text-xs truncate max-w-xs">{purchase.description}</td>
                                        </tr>
                                    ))}
                                    {purchases.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className={styles.emptyState}>
                                                <Package size={40} />
                                                <p>No purchase records found for this supplier.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'payments' && (
                    <div className={styles.sectionCard}>
                        <div className={styles.sectionHeader}>
                            <h3>Payment & Settlement History</h3>
                        </div>
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Mode</th>
                                        <th>Reference/Notes</th>
                                        <th>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map(payment => (
                                        <tr key={payment.id}>
                                            <td>{formatDate(payment.payment_date)}</td>
                                            <td>{payment.payment_mode}</td>
                                            <td className="text-muted text-xs">{payment.notes || 'No notes'}</td>
                                            <td className={cn(styles.statusPaid, "font-bold")}>{formatCurrency(payment.amount)}</td>
                                        </tr>
                                    ))}
                                    {payments.length === 0 && (
                                        <tr>
                                            <td colSpan="4" className={styles.emptyState}>
                                                <History size={40} />
                                                <p>No payments have been recorded yet.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className={styles.overview}>
                        <div className={styles.sectionCard}>
                            <div className={styles.sectionHeader}>
                                <h3>Full Supplier Profile</h3>
                            </div>
                            <div className={styles.infoGrid}>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>Supplier Name</div>
                                    <div className={styles.infoValue}>{supplier.name}</div>
                                </div>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>GST Number</div>
                                    <div className={cn(styles.infoValue, "font-mono")}>{supplier.gstin || 'N/A'}</div>
                                </div>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>Contact Person</div>
                                    <div className={styles.infoValue}>{supplier.contact_person || 'N/A'}</div>
                                </div>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>Email</div>
                                    <div className={styles.infoValue}>{supplier.email || 'N/A'}</div>
                                </div>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>Mobile Number</div>
                                    <div className={styles.infoValue}>{supplier.phone || 'N/A'}</div>
                                </div>
                                <div className={styles.infoItem}>
                                    <div className={styles.infoLabel}>Address</div>
                                    <div className={styles.infoValue}>{supplier.address || 'N/A'}</div>
                                </div>
                            </div>
                            {supplier.notes && (
                                <div className="p-6 border-t border-gray-100 italic text-muted text-sm bg-slate-50">
                                    <strong>Notes:</strong> {supplier.notes}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Record Payment Modal */}
            {recordPaymentModal && (
                <div className={styles.modalBackdrop} onClick={() => setRecordPaymentModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Record Supplier Payment</h2>
                            <button onClick={() => setRecordPaymentModal(false)} className={styles.closeButton}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleRecordPayment}>
                            <div className={styles.modalBody}>
                                <div className={styles.outstandingNotice}>
                                    <CreditCard size={18} />
                                    <span>Current outstanding balance: <strong>{formatCurrency(pendingBalance)}</strong></span>
                                </div>

                                <div className={styles.inputGroup}>
                                    <label className={cn(styles.flex, styles.itemsCenter, 'gap-2')}>
                                        <Factory size={14} />
                                        Factory *
                                    </label>
                                    <select
                                        className={styles.inputField}
                                        value={paymentFormData.factory_id || defaultFactoryId(selectedFactory, factories)}
                                        onChange={(e) =>
                                            setPaymentFormData((p) => ({ ...p, factory_id: e.target.value }))
                                        }
                                        required
                                    >
                                        {(factories || []).map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.name}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-muted text-xs mt-1 leading-snug">
                                        Choose the factory this payment applies to; it does not depend on the supplier record.
                                    </p>
                                </div>
                                
                                <div className={styles.inputGroup}>
                                    <label>Amount (₹)</label>
                                    <input
                                        type="number"
                                        required
                                        min="0.01"
                                        step="0.01"
                                        className={styles.inputField}
                                        value={paymentFormData.amount}
                                        onChange={(e) => setPaymentFormData({...paymentFormData, amount: e.target.value})}
                                        autoFocus
                                    />
                                </div>

                                <div className={styles.grid2}>
                                    <div className={styles.inputGroup}>
                                        <label>Date</label>
                                        <input
                                            type="date"
                                            required
                                            className={styles.inputField}
                                            value={paymentFormData.payment_date}
                                            onChange={(e) => setPaymentFormData({...paymentFormData, payment_date: e.target.value})}
                                        />
                                    </div>
                                    <div className={styles.inputGroup}>
                                        <label>Payment Mode</label>
                                        <select
                                            className={styles.inputField}
                                            value={paymentFormData.payment_mode}
                                            onChange={(e) => setPaymentFormData({...paymentFormData, payment_mode: e.target.value})}
                                        >
                                            <option value="Bank Transfer">Bank Transfer</option>
                                            <option value="Cash">Cash</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="UPI">UPI / Digital</option>
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.inputGroup}>
                                    <label>Notes / Reference</label>
                                    <textarea
                                        className={styles.inputField}
                                        rows="3"
                                        placeholder="Add payment reference, UTR or other details..."
                                        value={paymentFormData.notes}
                                        onChange={(e) => setPaymentFormData({...paymentFormData, notes: e.target.value})}
                                    ></textarea>
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    onClick={() => setRecordPaymentModal(false)}
                                    className={styles.cancelButton}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={paymentMutation.isPending || !paymentFormData.amount}
                                    className={styles.recordButton}
                                >
                                    {paymentMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                                    Confirm Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

