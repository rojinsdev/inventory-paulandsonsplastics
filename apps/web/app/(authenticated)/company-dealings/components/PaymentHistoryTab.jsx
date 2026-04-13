'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Plus, 
    History, 
    Loader2, 
    Search,
    CreditCard,
    IndianRupee,
    ArrowUpRight,
    ArrowDownLeft,
    Calendar,
    CheckCircle2,
    Factory,
} from 'lucide-react';
import { suppliersAPI, cashFlowAPI, purchasesAPI } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useFactory } from '@/contexts/FactoryContext';
import styles from '../CompanyDealings.module.css';

function defaultFactoryId(selectedFactory, factoriesList) {
    if (typeof selectedFactory === 'string' && selectedFactory) return selectedFactory;
    if (selectedFactory && typeof selectedFactory === 'object' && selectedFactory.id) return selectedFactory.id;
    return factoriesList?.[0]?.id || '';
}

export default function PaymentHistoryTab({ suppliers = [] }) {
    const { selectedFactory, factories } = useFactory();
    const queryClient = useQueryClient();
    const [modalOpen, setModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [formData, setFormData] = useState({
        factory_id: '',
        supplier_id: '',
        amount: '',
        payment_method: 'Bank Transfer',
        reference_number: '',
        notes: '',
    });

    // Queries
    const { data: payments = [], isLoading: loadingPayments } = useQuery({
        queryKey: ['supplier-payments'],
        queryFn: () => purchasesAPI.getPayments(), // This might need a supplier_id or be a general list
    });

    // Mutation
    const paymentMutation = useMutation({
        mutationFn: (data) => suppliersAPI.recordPayment(data.supplier_id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
            setModalOpen(false);
            setFormData({
                factory_id: defaultFactoryId(selectedFactory, factories),
                supplier_id: '',
                amount: '',
                payment_method: 'Bank Transfer',
                reference_number: '',
                notes: '',
            });
        },
        onError: (err) => alert(err.message)
    });

    useEffect(() => {
        if (!modalOpen) return;
        const def = defaultFactoryId(selectedFactory, factories);
        setFormData((prev) => ({
            ...prev,
            factory_id: prev.factory_id && factories?.some((f) => f.id === prev.factory_id) ? prev.factory_id : def,
        }));
    }, [modalOpen, selectedFactory, factories]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.supplier_id) return alert('Select a supplier');
        if (!formData.amount || formData.amount <= 0) return alert('Enter a valid amount');
        const factory_id = formData.factory_id || defaultFactoryId(selectedFactory, factories);
        if (!factory_id) {
            return alert('Select which factory this payment is for (cash flow is tracked per factory).');
        }
        paymentMutation.mutate({
            ...formData,
            amount: Number(formData.amount),
            factory_id,
        });
    };

    // Using direct payments data from backend (now includes flattened supplier_name)
    const filteredPayments = (payments || []).filter(p => 
        p.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.notes?.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

    if (loadingPayments) return <div className={cn(styles.flex, styles.itemsCenter, styles.justifyCenter, styles.p12)}><Loader2 className={cn(styles.animateSpin, styles.textPrimary)} /></div>;

    return (
        <div className={styles.tabContentInner}>
            <div className={styles.tableWrapper}>
                <div className={styles.filterContainer}>
                    <div className={styles.filterRow}>
                        <div className={styles.searchBox}>
                            <Search className={styles.filterIcon} size={20} />
                            <input
                                type="text"
                                placeholder="Search payments by supplier, reference or notes..."
                                className={cn("input", styles.filterInput)}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <button 
                        className="btn btn-primary"
                        onClick={() => setModalOpen(true)}
                    >
                        <Plus size={18} />
                        <span>Record Payment</span>
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Supplier</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                                <th style={{ textAlign: 'center' }}>Method</th>
                                <th>Reference</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPayments.map((payment) => (
                                <tr key={payment.id} className={styles.paymentRow}>
                                    <td className={cn(styles.textMuted, styles.textXs)}>
                                        <div className={cn(styles.flex, styles.itemsCenter, styles.gap1_5)}>
                                            <Calendar size={12} />
                                            {formatDate(payment.payment_date)}
                                        </div>
                                    </td>
                                    <td>
                                        <div className={cn(styles.fontSemibold, styles.textMain)}>{payment.supplier_name}</div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className={cn(styles.fontMono, styles.moneyIn)}>
                                            {formatCurrency(payment.amount)}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className={cn("badge badge-secondary", styles.textXs)}>
                                            {payment.payment_method}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={cn(styles.textMuted, styles.fontMono, styles.textXs)}>{payment.reference_number || '—'}</div>
                                    </td>
                                    <td>
                                        <div className={cn(styles.textXs, styles.maxWXxs, styles.truncate, styles.textMuted, styles.italic)}>
                                            {payment.notes || '—'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredPayments.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="empty-state">
                                        <History size={40} className="mb-2" />
                                        <p>No payment history found.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Record Payment Modal */}
            {modalOpen && (
                <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
                    <div className="modal modal-md" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2 className={styles.h4}>Record Supplier Payment</h2>
                                <p className={cn(styles.textXs, styles.textMuted)}>Document a credit settlement or advance payment</p>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="btn btn-outline">×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={cn("modal-body", styles.spaceY5)}>
                                <div className="form-group">
                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>
                                        <span className={cn(styles.flex, styles.itemsCenter, styles.gap2)}>
                                            <Factory size={14} />
                                            Factory *
                                        </span>
                                    </label>
                                    <select
                                        className="select"
                                        name="factory_id"
                                        value={formData.factory_id || defaultFactoryId(selectedFactory, factories)}
                                        onChange={handleInputChange}
                                        required
                                    >
                                        {(factories || []).map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.name}
                                            </option>
                                        ))}
                                    </select>
                                    <p className={cn(styles.textXs, styles.textMuted, styles.mt1)}>
                                        Same supplier can supply different factories; choose the site this payment applies to.
                                    </p>
                                </div>
                                <div className="form-group">
                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Select Supplier *</label>
                                    <select 
                                        className="select"
                                        name="supplier_id"
                                        value={formData.supplier_id}
                                        onChange={handleInputChange}
                                        required
                                    >
                                        <option value="">-- Choose Supplier --</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.name} (Outstanding: {formatCurrency(s.balance_due)})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Payment Amount *</label>
                                    <div className={styles.relative}>
                                        <div className={cn(styles.absolute, styles.left3, styles.top1_2, styles.translateY1_2, styles.textPrimary, styles.fontBold)}>
                                            <IndianRupee size={16} />
                                        </div>
                                        <input
                                            type="number"
                                            name="amount"
                                            required
                                            className={cn("input", styles.pl10, styles.fontBold, styles.textLg)}
                                            placeholder="0.00"
                                            value={formData.amount}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </div>

                                <div className={cn(styles.grid, styles.gridCols2, styles.gap4)}>
                                    <div className="form-group">
                                        <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Method</label>
                                        <select 
                                            className="select"
                                            name="payment_method"
                                            value={formData.payment_method}
                                            onChange={handleInputChange}
                                        >
                                            <option value="Bank Transfer">Bank Transfer</option>
                                            <option value="Cash">Cash</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="UPI">UPI / GPay</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Ref Number</label>
                                        <input
                                            type="text"
                                            name="reference_number"
                                            className="input"
                                            placeholder="TXN-1234..."
                                            value={formData.reference_number}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className={cn("form-label", styles.textXs, styles.uppercase, styles.trackingWider, styles.fontBold, styles.textMuted)}>Additional Notes</label>
                                    <textarea
                                        name="notes"
                                        className="textarea"
                                        rows="2"
                                        placeholder="Enter any additional details here..."
                                        value={formData.notes}
                                        onChange={handleInputChange}
                                    ></textarea>
                                </div>
                            </div>
                            <div className={cn("modal-footer", styles.pb6, styles.px6)}>
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={paymentMutation.isPending}
                                    className={cn("btn btn-primary", styles.minW160)}
                                >
                                    {paymentMutation.isPending ? (
                                        <Loader2 size={18} className={styles.animateSpin} />
                                    ) : (
                                        <CheckCircle2 size={18} />
                                    )}
                                    Save Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
