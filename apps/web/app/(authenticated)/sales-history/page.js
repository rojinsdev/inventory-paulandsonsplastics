'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { ordersAPI } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { useFactory } from '@/contexts/FactoryContext';
import styles from './page.module.css';

const PAGE_SIZE = 20;

function summarizeLines(items) {
    if (!items?.length) return '—';
    return items
        .map((row) => {
            const name = row.products?.name || row.caps?.name || 'Item';
            const shipped = row.quantity_shipped ?? 0;
            const qty = row.quantity ?? 0;
            return `${name}: ${shipped}/${qty} ${row.unit_type || ''}`.trim();
        })
        .join(' · ');
}

export default function SalesHistoryPage() {
    const { selectedFactory } = useFactory();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');

    const { data, isLoading, error } = useQuery({
        queryKey: ['sales-history', selectedFactory, page],
        queryFn: () =>
            ordersAPI.getAll({
                status: 'delivered,partially_delivered',
                ...(selectedFactory ? { factory_id: selectedFactory } : {}),
                page,
                size: PAGE_SIZE,
            }),
    });

    const orders = data?.orders ?? [];
    const pagination = data?.pagination ?? { total: 0, page: 1, size: PAGE_SIZE };
    const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / PAGE_SIZE));

    useEffect(() => {
        setPage(1);
    }, [selectedFactory]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return orders;
        return orders.filter((o) => {
            const idShort = (o.id || '').slice(-6).toLowerCase();
            const cust = (o.customer?.name || '').toLowerCase();
            return idShort.includes(q) || cust.includes(q) || (o.id || '').toLowerCase().includes(q);
        });
    }, [orders, search]);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Sales history</h1>
                    <p className={styles.subtitle}>Delivered and partially delivered orders.</p>
                </div>
            </header>

            <div className={styles.filters}>
                <div className={styles.searchBox}>
                    <Search size={18} />
                    <input
                        type="search"
                        placeholder="Search customer or order # (last 6)…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search sales history"
                    />
                </div>
                <p className={styles.filterHint}>Search applies to this page of results.</p>
            </div>

            {isLoading && <div className={styles.loading}>Loading sales history…</div>}
            {error && (
                <div className={styles.empty} role="alert">
                    {error.message || 'Failed to load orders.'}
                </div>
            )}

            {!isLoading && !error && (
                <>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>Customer</th>
                                    <th>Order date</th>
                                    <th>Last delivery</th>
                                    <th>Status</th>
                                    <th>Total</th>
                                    <th>Lines (shipped / ordered)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className={styles.empty}>
                                            No matching delivered orders. Try clearing search or check{' '}
                                            <Link href="/orders">Sales Orders</Link>.
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((o) => (
                                        <tr key={o.id}>
                                            <td className={styles.orderId}>#{o.id?.slice(-6).toUpperCase()}</td>
                                            <td>{o.customer?.name || '—'}</td>
                                            <td>{formatDate(o.order_date)}</td>
                                            <td>{o.delivered_at ? formatDateTime(o.delivered_at) : '—'}</td>
                                            <td>
                                                {o.status === 'delivered' ? (
                                                    <span className={`${styles.badge} ${styles.badgeDelivered}`}>
                                                        Delivered
                                                    </span>
                                                ) : (
                                                    <span className={`${styles.badge} ${styles.badgePartial}`}>
                                                        Partial
                                                    </span>
                                                )}
                                            </td>
                                            <td>{formatCurrency(o.total_amount)}</td>
                                            <td className={styles.linesCell}>{summarizeLines(o.sales_order_items)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.pagination}>
                        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            Previous
                        </button>
                        <span>
                            Page {page} of {totalPages} ({pagination.total ?? 0} orders)
                        </span>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                            Next
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
