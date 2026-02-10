'use client';

import { useMemo } from 'react';
import { Loader2, Package, Search, Filter } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import styles from './InternalStockTable.module.css';
import { Factory } from 'lucide-react';

export default function InternalStockTable({ stock, products, loading, filters, setFilters, factories = [] }) {
    // Transform stock data into product-centric rows
    const tableData = useMemo(() => {
        if (!products || !Array.isArray(products)) return [];

        let data = products.map(product => {
            let productStock = stock?.filter(s => s.product_id === product.id) || [];

            // If factory filter is active, further narrow down the stock records
            if (filters?.factory_id) {
                productStock = productStock.filter(s => s.factory_id === filters.factory_id);
            }

            const getSum = (state) => productStock
                .filter(s => s.state === state)
                .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

            const finished = getSum('finished');
            const reserved = getSum('reserved');

            return {
                ...product,
                semi_finished: getSum('semi_finished'),
                packed: getSum('packed'),
                finished: finished,
                reserved: reserved,
                available: Math.max(0, finished - reserved)
            };
        });

        // Apply filters
        if (filters?.search) {
            const searchLower = filters.search.toLowerCase();
            data = data.filter(item =>
                (item.name || '').toLowerCase().includes(searchLower) ||
                (item.size || '').toLowerCase().includes(searchLower) ||
                (item.color || '').toLowerCase().includes(searchLower) ||
                (item.sku || '').toLowerCase().includes(searchLower)
            );
        }

        if (filters?.product_id) {
            data = data.filter(item => item.id === filters.product_id);
        }

        if (filters?.factory_id) {
            data = data.filter(item => {
                const itemStock = stock?.filter(s => s.product_id === item.id) || [];
                return itemStock.some(s => s.factory_id === filters.factory_id);
            });
        }

        return data;
    }, [products, stock, filters]);

    if (loading) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spinner} size={24} />
                <span>Loading internal stock...</span>
            </div>
        );
    }

    return (
        <div className="card">
            <div className={styles.filterContainer}>
                <div className={styles.filterRow}>
                    <div className={styles.searchBox}>
                        <Search className={styles.filterIcon} size={20} />
                        <input
                            type="text"
                            placeholder="Snapshot search (SKU, name, size)..."
                            className={styles.filterInput}
                            value={filters?.search || ''}
                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <Factory className={styles.filterIcon} size={18} />
                        <select
                            className={styles.filterSelect}
                            value={filters?.factory_id || ''}
                            onChange={(e) => setFilters(prev => ({ ...prev, factory_id: e.target.value }))}
                        >
                            <option value="">All Factories</option>
                            {factories.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <Filter className={styles.filterIcon} size={18} />
                        <select
                            className={styles.filterSelect}
                            value={filters?.product_id || ''}
                            onChange={(e) => setFilters(prev => ({ ...prev, product_id: e.target.value }))}
                        >
                            <option value="">All Products</option>
                            {products.map(product => (
                                <option key={product.id} value={product.id}>
                                    {product.name} ({product.size})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            <div className="card-body p-0" style={{ overflowX: 'auto' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Product Info</th>
                            <th style={{ textAlign: 'right' }}>Loose (Items)</th>
                            <th style={{ textAlign: 'right' }}>Packed (Packets)</th>
                            <th style={{ textAlign: 'right' }}>Finished (Bundles)</th>
                            <th style={{ textAlign: 'right' }}>Reserved</th>
                            <th style={{ textAlign: 'right', color: 'var(--primary)' }}>Available</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="text-center py-5">
                                    <Package size={40} className="text-muted mb-2 mx-auto" />
                                    <p className="text-muted">No products found matching your filters.</p>
                                </td>
                            </tr>
                        ) : (
                            tableData.map((item) => (
                                <tr key={item.id}>
                                    <td>
                                        <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>{item.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {item.size} | {item.color} | {item.sku || 'No SKU'}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>{formatNumber(item.semi_finished)}</td>
                                    <td style={{ textAlign: 'right' }}>{formatNumber(item.packed)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>
                                        {formatNumber(item.finished)}
                                    </td>
                                    <td style={{ textAlign: 'right', color: 'var(--warning)' }}>
                                        {formatNumber(item.reserved)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                        {formatNumber(item.available)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
