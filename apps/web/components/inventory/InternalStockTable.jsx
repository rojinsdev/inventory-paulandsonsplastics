'use client';

import { useMemo, useState, Fragment } from 'react';
import { Loader2, Package, Search, Filter, ChevronDown } from 'lucide-react';
import { formatNumber, cn } from '@/lib/utils';
import styles from './InternalStockTable.module.css';
import { Factory } from 'lucide-react';

export default function InternalStockTable({ stock, products, loading, filters, setFilters, factories = [] }) {
    const [expandedTemplates, setExpandedTemplates] = useState({});

    const toggleTemplate = (templateId) => {
        setExpandedTemplates(prev => ({
            ...prev,
            [templateId]: !prev[templateId]
        }));
    };

    // Transform stock data into product-centric rows grouped by template
    const tableData = useMemo(() => {
        if (!products || !Array.isArray(products)) return [];

        // Safety check for stock - handle paginated response or raw array
        const stockData = Array.isArray(stock) ? stock : (stock?.data || []);

        // 1. Enrich variants with stock data
        const enrichedVariants = products.map(product => {
            let productStock = stockData.filter(s => s.product_id === product.id);

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

        // 2. Group by template
        const groups = {};
        enrichedVariants.forEach(variant => {
            const tid = variant.template_id || 'no_template';
            if (!groups[tid]) {
                groups[tid] = {
                    id: tid,
                    name: variant.template_name || variant.name,
                    size: variant.size,
                    variants: [],
                    totals: {
                        semi_finished: 0,
                        packed: 0,
                        finished: 0,
                        reserved: 0,
                        available: 0
                    }
                };
            }
            groups[tid].variants.push(variant);
            groups[tid].totals.semi_finished += variant.semi_finished;
            groups[tid].totals.packed += variant.packed;
            groups[tid].totals.finished += variant.finished;
            groups[tid].totals.reserved += variant.reserved;
            groups[tid].totals.available += variant.available;
        });

        let data = Object.values(groups);

        // 3. Apply filters
        if (filters?.search) {
            const searchLower = filters.search.toLowerCase();
            data = data.filter(group => {
                const matchesTemplate = group.name.toLowerCase().includes(searchLower) || group.size.toLowerCase().includes(searchLower);
                const matchesVariant = group.variants.some(v =>
                    v.color.toLowerCase().includes(searchLower) ||
                    (v.sku || '').toLowerCase().includes(searchLower)
                );
                return matchesTemplate || matchesVariant;
            });
        }

        if (filters?.product_id) {
            data = data.filter(group => group.variants.some(v => v.id === filters.product_id));
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
                            placeholder="Search templates or colors..."
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
                            <th style={{ width: '40px' }}></th>
                            <th>Product Template / Color</th>
                            <th style={{ textAlign: 'right' }}>Loose</th>
                            <th style={{ textAlign: 'right' }}>Packed</th>
                            <th style={{ textAlign: 'right' }}>Finished</th>
                            <th style={{ textAlign: 'right' }}>Reserved</th>
                            <th style={{ textAlign: 'right', color: 'var(--primary)' }}>Available</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="text-center py-5">
                                    <Package size={40} className="text-muted mb-2 mx-auto" />
                                    <p className="text-muted">No entries found matching filters.</p>
                                </td>
                            </tr>
                        ) : (
                            tableData.map((group) => {
                                const isExpanded = expandedTemplates[group.id];
                                const hasTemplate = group.id !== 'no_template';

                                return (
                                    <Fragment key={group.id}>
                                        {/* Template Row */}
                                        <tr
                                            className={cn(styles.templateRow, isExpanded && styles.expanded)}
                                            onClick={() => hasTemplate && toggleTemplate(group.id)}
                                        >
                                            <td style={{ textAlign: 'center' }}>
                                                {hasTemplate && (
                                                    <div className={styles.expandBtn}>
                                                        <ChevronDown size={14} />
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <div className={styles.templateName}>
                                                    {group.name}
                                                    <span className={cn(styles.badge, styles.templateBadge)}>
                                                        {group.size}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>{formatNumber(group.totals.semi_finished)}</td>
                                            <td style={{ textAlign: 'right' }}>{formatNumber(group.totals.packed)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>
                                                {formatNumber(group.totals.finished)}
                                            </td>
                                            <td style={{ textAlign: 'right', color: 'var(--warning)' }}>
                                                {formatNumber(group.totals.reserved)}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                {formatNumber(group.totals.available)}
                                            </td>
                                        </tr>

                                        {/* Variant Rows (Color-specific) */}
                                        {(isExpanded || !hasTemplate) && group.variants.map((variant) => (
                                            <tr key={variant.id} className={styles.variantRow}>
                                                <td></td>
                                                <td className={styles.variantIndent}>
                                                    <div className={styles.variantLabel}>
                                                        {variant.color} | {variant.sku || 'No SKU'}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>{formatNumber(variant.semi_finished)}</td>
                                                <td style={{ textAlign: 'right' }}>{formatNumber(variant.packed)}</td>
                                                <td style={{ textAlign: 'right' }}>{formatNumber(variant.finished)}</td>
                                                <td style={{ textAlign: 'right' }}>{formatNumber(variant.reserved)}</td>
                                                <td style={{ textAlign: 'right' }}>{formatNumber(variant.available)}</td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
