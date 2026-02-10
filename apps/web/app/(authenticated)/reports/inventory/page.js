'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUI } from '@/contexts/UIContext';
import { Loader2, Package, Boxes, ArrowRight, TrendingUp, Download, Calendar, Filter, X, RefreshCw, Search } from 'lucide-react';
import { reportsAPI, productsAPI } from '@/lib/api';
import { useFactory } from '@/contexts/FactoryContext';
import { useGuide } from '@/contexts/GuideContext';
import { formatNumber, formatDate, cn } from '@/lib/utils';
import styles from './page.module.css';

const DATE_PRESETS = [
    { value: 'today', label: 'Today' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'custom', label: 'Custom Range' },
];

export default function InventoryReportsPage() {
    const queryClient = useQueryClient();
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory } = useFactory();
    const [datePreset, setDatePreset] = useState('this_month');
    const [filters, setFilters] = useState({
        date_from: '',
        date_to: '',
        product_search: '',
    });

    // Queries
    // Queries
    const { data: reportData, isLoading: loading, error: queryError, refetch } = useQuery({
        queryKey: ['inventory-report', { from: filters.date_from, to: filters.date_to }, selectedFactory],
        queryFn: () => reportsAPI.getInventory({
            from: filters.date_from,
            to: filters.date_to,
            factory_id: selectedFactory || undefined
        }),
        enabled: !!(filters.date_from || filters.date_to),
    });

    const { data: productsData } = useQuery({
        queryKey: ['products', { factory_id: selectedFactory }],
        queryFn: () => productsAPI.getAll({ factory_id: selectedFactory || undefined }),
    });

    const error = queryError?.message;
    const report = reportData || {};
    const products = Array.isArray(productsData) ? productsData : [];


    useEffect(() => {
        setPageTitle('Inventory Reports');
        registerGuide({
            title: "Inventory Reports",
            description: "Comprehensive stock metrics across the entire production lifecycle.",
            logic: [
                {
                    title: "Stock Flow Dynamics (WIP to Finished)",
                    explanation: "This tracks items as they move from 'Semi-Finished' (loose pieces) to 'Packed' (packets) and finally 'Finished' (sellable bundles). Bottlenecks here often indicate packing station delays."
                },
                {
                    title: "Safety Thresholds (Sellable Stock)",
                    explanation: "The system compares 'Finished minus Reserved' (available now) against your safety limits. If available stock drops below the threshold, it triggers a 'Low Stock' warning for re-production."
                }
            ],
            components: [
                {
                    name: "Stock Status Heatmap",
                    description: "Quick-look cards showing total capital tied up in items vs. ready bundles."
                },
                {
                    name: "Inventory Matrix",
                    description: "Multi-dimensional view of stock levels at every stage: Semi-Finished, Packed, Finished, and Committed (Reserved)."
                }
            ]
        });
        applyDatePreset(datePreset);
    }, [registerGuide, setPageTitle, datePreset]);



    const getDateRange = (preset) => {
        const today = new Date();
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_week':
                start.setDate(today.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_month':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'last_month':
                start.setMonth(today.getMonth() - 1, 1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(today.getMonth(), 0);
                end.setHours(23, 59, 59, 999);
                break;
            default:
                return { from: '', to: '' };
        }

        return {
            from: start.toISOString().split('T')[0],
            to: end.toISOString().split('T')[0],
        };
    };

    const applyDatePreset = (preset) => {
        if (preset === 'custom') {
            return;
        }
        const range = getDateRange(preset);
        setFilters(prev => ({
            ...prev,
            date_from: range.from,
            date_to: range.to,
        }));
    };

    const loadData = () => {
        refetch();
    };

    const handleFilter = () => {
        loadData();
    };

    const handleClearFilters = () => {
        setFilters({
            date_from: '',
            date_to: '',
            product_search: '',
        });
        setDatePreset('custom');
    };

    const handleExport = () => {
        if (!report?.by_product || report.by_product.length === 0) return;

        const csvContent = [
            ['Product', 'Semi-Finished', 'Packed', 'Finished', 'Reserved', 'Total Bundles'].join(','),
            ...report.by_product
                .filter(item => {
                    if (!filters.product_search) return true;
                    const productName = getProductName(item.product_id).toLowerCase();
                    return productName.includes(filters.product_search.toLowerCase());
                })
                .map(item => [
                    getProductName(item.product_id),
                    item.semi_finished || 0,
                    item.packed || 0,
                    item.finished || 0,
                    item.reserved || 0,
                    (item.finished || 0) + (item.reserved || 0),
                ].map(field => `"${field}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory-report-${filters.date_from || 'all'}-${filters.date_to || 'all'}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size})` : 'Unknown';
    };

    const filteredProducts = report?.by_product?.filter(item => {
        if (!filters.product_search) return true;
        const productName = getProductName(item.product_id).toLowerCase();
        return productName.includes(filters.product_search.toLowerCase());
    }) || [];

    const hasFilters = filters.date_from || filters.date_to || filters.product_search;
    const lowStockCount = filteredProducts.filter(item =>
        (item.finished || 0) + (item.reserved || 0) < 10
    ).length;

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Inventory Reports</h1>
                    <p className={styles.pageDescription}>
                        Track stock movements, inventory levels, and product availability
                    </p>
                </div>
                {report?.by_product && report.by_product.length > 0 && (
                    <button className={styles.exportButton} onClick={handleExport}>
                        <Download size={18} />
                        <span>Export CSV</span>
                    </button>
                )}
            </div>

            {/* Filter Bar */}
            <div className={styles.filterBar}>
                <div className={styles.filterRow}>
                    <div className={styles.filterGroup}>
                        <Filter size={16} className={styles.filterIcon} />
                        <select
                            className={styles.filterSelect}
                            value={datePreset}
                            onChange={(e) => {
                                setDatePreset(e.target.value);
                                applyDatePreset(e.target.value);
                            }}
                        >
                            {DATE_PRESETS.map((preset) => (
                                <option key={preset.value} value={preset.value}>
                                    {preset.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {datePreset === 'custom' && (
                        <>
                            <div className={styles.filterGroup}>
                                <input
                                    type="date"
                                    className={styles.filterInput}
                                    value={filters.date_from}
                                    onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                                    placeholder="From Date"
                                />
                            </div>
                            <div className={styles.filterGroup}>
                                <input
                                    type="date"
                                    className={styles.filterInput}
                                    value={filters.date_to}
                                    onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                                    placeholder="To Date"
                                />
                            </div>
                        </>
                    )}

                    <div className={styles.filterGroup}>
                        <Search size={16} className={styles.filterIcon} />
                        <input
                            type="text"
                            className={styles.filterInput}
                            value={filters.product_search}
                            onChange={(e) => setFilters({ ...filters, product_search: e.target.value })}
                            placeholder="Search products..."
                        />
                    </div>

                    <div className={styles.filterActions}>
                        <button className={styles.applyButton} onClick={handleFilter}>
                            Apply Filters
                        </button>
                        {hasFilters && (
                            <button className={styles.clearButton} onClick={handleClearFilters}>
                                <X size={16} />
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatNumber(report?.total_items || 0)}</div>
                        <div className={styles.statLabel}>Total Items</div>
                        <div className={styles.statSublabel}>In system</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Boxes size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatNumber(report?.total_bundles || 0)}</div>
                        <div className={styles.statLabel}>Total Bundles</div>
                        <div className={styles.statSublabel}>Ready for sale</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <TrendingUp size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatNumber(report?.movements_count || 0)}</div>
                        <div className={styles.statLabel}>Movements</div>
                        <div className={styles.statSublabel}>In period</div>
                    </div>
                </div>
                {lowStockCount > 0 && (
                    <div className={`${styles.statCard} ${styles.statCardWarning}`}>
                        <div className={styles.statIcon}>
                            <ArrowRight size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{lowStockCount}</div>
                            <div className={styles.statLabel}>Low Stock</div>
                            <div className={styles.statSublabel}>Below threshold</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spinner} />
                        <span>Loading inventory report...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <Package size={24} />
                        <p>{error}</p>
                        <button className={styles.retryButton} onClick={() => refetch()}>
                            <RefreshCw size={16} />
                            Retry
                        </button>
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Package size={48} />
                        <p>No inventory data found</p>
                        <p className={styles.emptyHint}>
                            {hasFilters ? 'Try adjusting your filters' : 'No products in inventory'}
                        </p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th style={{ textAlign: 'right' }}>Semi-Finished</th>
                                    <th style={{ textAlign: 'right' }}>Packed</th>
                                    <th style={{ textAlign: 'right' }}>Finished</th>
                                    <th style={{ textAlign: 'right' }}>Reserved</th>
                                    <th style={{ textAlign: 'right' }}>Total Bundles</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map((item, idx) => {
                                    const totalBundles = (item.finished || 0) + (item.reserved || 0);
                                    const isLowStock = totalBundles < 10;
                                    return (
                                        <tr key={idx}>
                                            <td className={styles.productCell}>{getProductName(item.product_id)}</td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                                {formatNumber(item.semi_finished || 0)}
                                            </td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                                {formatNumber(item.packed || 0)}
                                            </td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                                {formatNumber(item.finished || 0)}
                                            </td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                                {formatNumber(item.reserved || 0)}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className={cn(styles.totalBadge, isLowStock && styles.totalBadgeLow)}>
                                                    {formatNumber(totalBundles)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
