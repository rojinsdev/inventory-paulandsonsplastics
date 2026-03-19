'use client';

import { useState, useMemo } from 'react';
import { HardHat, Search, Factory, Loader2, Package } from 'lucide-react';
import { formatNumber, cn } from '@/lib/utils';
import styles from './CapStockTable.module.css';

export default function CapStockTable({ stock, loading, filters, setFilters, factories = [] }) {
    // Transform stock data for display
    const tableData = useMemo(() => {
        if (!stock || !Array.isArray(stock)) return [];

        let data = stock.map(item => ({
            id: item.id,
            cap_id: item.cap_id,
            name: item.caps?.name || 'Unknown Cap',
            color: item.caps?.color || 'N/A',
            factory_id: item.factory_id,
            factory_name: factories.find(f => f.id === item.factory_id)?.name || 'Unknown',
            quantity: Number(item.quantity) || 0,
            ideal_weight: item.caps?.ideal_weight_grams || 0
        }));

        // Apply filters
        if (filters?.search) {
            const searchLower = filters.search.toLowerCase();
            data = data.filter(item => 
                item.name.toLowerCase().includes(searchLower) || 
                item.color.toLowerCase().includes(searchLower)
            );
        }

        if (filters?.factory_id) {
            data = data.filter(item => item.factory_id === filters.factory_id);
        }

        // Group by Cap Name and within that show colors
        const grouped = {};
        data.forEach(item => {
            const key = item.name;
            if (!grouped[key]) {
                grouped[key] = {
                    name: item.name,
                    variants: [],
                    total: 0
                };
            }
            grouped[key].variants.push(item);
            grouped[key].total += item.quantity;
        });

        return Object.values(grouped);
    }, [stock, filters, factories]);

    if (loading) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spinner} size={24} />
                <span>Loading cap stock...</span>
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
                            placeholder="Search cap names or colors..."
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
                </div>
            </div>
            
            <div className="card-body p-0" style={{ overflowX: 'auto' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Cap Template</th>
                            <th>Color</th>
                            <th>Factory</th>
                            <th style={{ textAlign: 'right' }}>Weight (Est.)</th>
                            <th style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>Stock (Loose)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="text-center py-5">
                                    <HardHat size={40} className="text-muted mb-2 mx-auto" />
                                    <p className="text-muted">No cap stock entries found.</p>
                                </td>
                            </tr>
                        ) : (
                            tableData.map((group) => (
                                group.variants.map((variant, idx) => (
                                    <tr key={`${group.name}-${variant.color}-${variant.factory_id}`}>
                                        {idx === 0 ? (
                                            <td rowSpan={group.variants.length} style={{ verticalAlign: 'middle', fontWeight: 500 }}>
                                                {group.name}
                                            </td>
                                        ) : null}
                                        <td>
                                            <span className={cn(styles.badge, styles.colorBadge)}>
                                                {variant.color}
                                            </span>
                                        </td>
                                        <td>{variant.factory_name}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                            {formatNumber((variant.quantity * variant.ideal_weight) / 1000, 2)} kg
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                            {formatNumber(variant.quantity)}
                                        </td>
                                    </tr>
                                ))
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
