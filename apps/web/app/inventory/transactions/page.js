'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout';
import { Loader2, Search, Filter, ArrowUpRight, ArrowDownRight, FileText } from 'lucide-react';
import { inventoryAPI, productsAPI } from '@/lib/api';
import { formatNumber, formatDate, cn } from '@/lib/utils';
import styles from './page.module.css';

const TRANSACTION_TYPES = [
    { value: '', label: 'All Types' },
    { value: 'production', label: 'Production' },
    { value: 'packing', label: 'Packing' },
    { value: 'bundling', label: 'Bundling' },
    { value: 'reservation', label: 'Reservation' },
    { value: 'delivery', label: 'Delivery' },
    { value: 'adjustment', label: 'Adjustment' },
];

export default function TransactionsPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [products, setProducts] = useState([]);
    const [filters, setFilters] = useState({
        type: '',
        product_id: '',
        date_from: '',
        date_to: '',
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [txData, productsData] = await Promise.all([
                inventoryAPI.getTransactions().catch(() => []),
                productsAPI.getAll().catch(() => []),
            ]);
            setTransactions(Array.isArray(txData) ? txData : []);
            setProducts(Array.isArray(productsData) ? productsData : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Get product name
    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size})` : 'Unknown';
    };

    // Filter transactions
    const filteredTx = transactions.filter((tx) => {
        const typeMatch = !filters.type || tx.type === filters.type;
        const productMatch = !filters.product_id || tx.product_id === filters.product_id;

        let dateMatch = true;
        if (filters.date_from) {
            dateMatch = new Date(tx.created_at) >= new Date(filters.date_from);
        }
        if (filters.date_to && dateMatch) {
            dateMatch = new Date(tx.created_at) <= new Date(filters.date_to + 'T23:59:59');
        }

        return typeMatch && productMatch && dateMatch;
    });

    return (
        <DashboardLayout title="Inventory Transactions">
            <div className="page-header">
                <div>
                    <p className="text-muted">Complete audit trail of all inventory movements</p>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                <select
                    className="select"
                    value={filters.type}
                    onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                >
                    {TRANSACTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>

                <select
                    className="select"
                    value={filters.product_id}
                    onChange={(e) => setFilters({ ...filters, product_id: e.target.value })}
                >
                    <option value="">All Products</option>
                    {products.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name} ({p.size})
                        </option>
                    ))}
                </select>

                <input
                    type="date"
                    className="input"
                    value={filters.date_from}
                    onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                    placeholder="From Date"
                />

                <input
                    type="date"
                    className="input"
                    value={filters.date_to}
                    onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                    placeholder="To Date"
                />

                {(filters.type || filters.product_id || filters.date_from || filters.date_to) && (
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFilters({ type: '', product_id: '', date_from: '', date_to: '' })}
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Count */}
            <div className={styles.countBar}>
                <span>Showing {filteredTx.length} transactions</span>
            </div>

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading transactions...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>Error: {error}</p>
                        <button className="btn btn-secondary" onClick={loadData}>
                            Retry
                        </button>
                    </div>
                ) : filteredTx.length === 0 ? (
                    <div className="empty-state">
                        <FileText size={48} />
                        <p>No transactions found</p>
                        <p className="text-muted">
                            {transactions.length > 0
                                ? 'Try adjusting your filters'
                                : 'Transactions will appear here as inventory moves'}
                        </p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Product</th>
                                    <th>From State</th>
                                    <th>To State</th>
                                    <th style={{ textAlign: 'right' }}>Quantity</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTx.map((tx) => (
                                    <tr key={tx.id}>
                                        <td className="text-muted">{formatDate(tx.created_at)}</td>
                                        <td>
                                            <span className={cn('badge', getTypeBadge(tx.type))}>
                                                {tx.type}
                                            </span>
                                        </td>
                                        <td className="font-medium">{getProductName(tx.product_id)}</td>
                                        <td>
                                            <span className="badge badge-gray">{tx.from_state || '—'}</span>
                                        </td>
                                        <td>
                                            <span className="badge badge-gray">{tx.to_state || '—'}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className={cn(styles.quantity, tx.quantity > 0 ? styles.positive : styles.negative)}>
                                                {tx.quantity > 0 && '+'}
                                                {formatNumber(tx.quantity)}
                                            </span>
                                        </td>
                                        <td className="text-muted">{tx.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

function getTypeBadge(type) {
    const badges = {
        production: 'badge-primary',
        packing: 'badge-warning',
        bundling: 'badge-success',
        reservation: 'badge-gray',
        delivery: 'badge-success',
        adjustment: 'badge-error',
    };
    return badges[type] || 'badge-gray';
}
