'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout';
import { Loader2, ShoppingCart, Users, DollarSign, TrendingUp, Download, Calendar, Filter, X, RefreshCw } from 'lucide-react';
import { reportsAPI, customersAPI, productsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatNumber, formatCurrency, formatDate, cn } from '@/lib/utils';
import styles from './page.module.css';

const DATE_PRESETS = [
    { value: 'today', label: 'Today' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'custom', label: 'Custom Range' },
];

export default function SalesReportsPage() {
    const { registerGuide } = useGuide();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [report, setReport] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [datePreset, setDatePreset] = useState('this_month');
    const [filters, setFilters] = useState({
        date_from: '',
        date_to: '',
    });

    useEffect(() => {
        registerGuide({
            title: "Sales & Revenue Analysis",
            description: "Financial performance tracking and customer behavior analytics.",
            logic: [
                {
                    title: "Pareto Analysis (The 80/20 Rule)",
                    explanation: "This identifies the top 20% of your customers who drive 80% of your revenue. The system highlights these 'VIP' accounts so you can prioritize their orders when stock is limited."
                },
                {
                    title: "Revenue Recognition",
                    explanation: "Revenue is officially counted only when an order is 'Delivered'. 'Pending' or 'Processing' orders show your pipeline but do not affect your actual financial balance yet."
                }
            ],
            components: [
                {
                    name: "Financial Summary",
                    description: "Snapshot of total revenue, order count, and unique active customers."
                },
                {
                    name: "Leadership Boards",
                    description: "Rankings of top-performing products and high-value customers by quantity and frequency."
                }
            ]
        });
        loadCustomersAndProducts();
        applyDatePreset(datePreset);
    }, [registerGuide]);

    useEffect(() => {
        if (filters.date_from || filters.date_to) {
            loadData();
        }
    }, [filters.date_from, filters.date_to]);

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

    const loadCustomersAndProducts = async () => {
        try {
            const [customersData, productsData] = await Promise.all([
                customersAPI.getAll().catch(() => []),
                productsAPI.getAll().catch(() => []),
            ]);
            setCustomers(Array.isArray(customersData) ? customersData : []);
            setProducts(Array.isArray(productsData) ? productsData : []);
        } catch (err) {
            console.error('Failed to load customers/products:', err);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const params = {
                from: filters.date_from,
                to: filters.date_to,
            };
            const reportData = await reportsAPI.getSales(params).catch(() => ({}));
            setReport(reportData || {});
        } catch (err) {
            setError(err.message || 'Failed to load sales report');
        } finally {
            setLoading(false);
        }
    };

    const handleFilter = () => {
        loadData();
    };

    const handleClearFilters = () => {
        setFilters({
            date_from: '',
            date_to: '',
        });
        setDatePreset('custom');
    };

    const handleExport = () => {
        const csvRows = [];

        // Summary
        csvRows.push(['Sales Report Summary']);
        csvRows.push(['Period', `${filters.date_from || 'All'} to ${filters.date_to || 'All'}`]);
        csvRows.push(['Total Orders', report?.total_orders || 0]);
        csvRows.push(['Unique Customers', report?.unique_customers || 0]);
        csvRows.push(['Total Bundles', report?.total_bundles || 0]);
        csvRows.push(['Total Revenue', formatCurrency(report?.total_revenue || 0)]);
        csvRows.push([]);

        // Top Customers
        if (report?.top_customers && report.top_customers.length > 0) {
            csvRows.push(['Top Customers']);
            csvRows.push(['Customer', 'Orders', 'Bundles'].join(','));
            report.top_customers.forEach(item => {
                csvRows.push([
                    getCustomerName(item.customer_id),
                    item.order_count,
                    item.total_bundles,
                ].map(field => `"${field}"`).join(','));
            });
            csvRows.push([]);
        }

        // Top Products
        if (report?.top_products && report.top_products.length > 0) {
            csvRows.push(['Top Products']);
            csvRows.push(['Product', 'Bundles Sold'].join(','));
            report.top_products.forEach(item => {
                csvRows.push([
                    getProductName(item.product_id),
                    item.quantity,
                ].map(field => `"${field}"`).join(','));
            });
        }

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales-report-${filters.date_from || 'all'}-${filters.date_to || 'all'}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const getCustomerName = (id) => customers.find((c) => c.id === id)?.name || 'Unknown';
    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size})` : 'Unknown';
    };

    const hasFilters = filters.date_from || filters.date_to;

    return (
        <DashboardLayout title="Sales Reports">
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Sales Reports</h1>
                    <p className={styles.pageDescription}>
                        Analyze sales performance, customer trends, and revenue metrics
                    </p>
                </div>
                {report && (
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
                        <ShoppingCart size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatNumber(report?.total_orders || 0)}</div>
                        <div className={styles.statLabel}>Total Orders</div>
                        <div className={styles.statSublabel}>In period</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Users size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatNumber(report?.unique_customers || 0)}</div>
                        <div className={styles.statLabel}>Unique Customers</div>
                        <div className={styles.statSublabel}>Active buyers</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <TrendingUp size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatNumber(report?.total_bundles || 0)}</div>
                        <div className={styles.statLabel}>Bundles Sold</div>
                        <div className={styles.statSublabel}>Total quantity</div>
                    </div>
                </div>
                <div className={`${styles.statCard} ${styles.statCardRevenue}`}>
                    <div className={styles.statIcon}>
                        <DollarSign size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatCurrency(report?.total_revenue || 0)}</div>
                        <div className={styles.statLabel}>Total Revenue</div>
                        <div className={styles.statSublabel}>Sales amount</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className={styles.reportGrid}>
                {/* Top Customers */}
                <div className={styles.tableCard}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>Top Customers</h3>
                    </div>
                    {loading ? (
                        <div className={styles.loading}>
                            <Loader2 size={24} className={styles.spinner} />
                        </div>
                    ) : error ? (
                        <div className={styles.error}>
                            <p>{error}</p>
                        </div>
                    ) : report?.top_customers && report.top_customers.length > 0 ? (
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th style={{ textAlign: 'right' }}>Orders</th>
                                        <th style={{ textAlign: 'right' }}>Bundles</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.top_customers.slice(0, 10).map((item, idx) => (
                                        <tr key={idx}>
                                            <td className={styles.customerCell}>{getCustomerName(item.customer_id)}</td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                                {item.order_count}
                                            </td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                                {formatNumber(item.total_bundles)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <Users size={32} />
                            <p>No customer data</p>
                        </div>
                    )}
                </div>

                {/* Top Products */}
                <div className={styles.tableCard}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>Top Products</h3>
                    </div>
                    {loading ? (
                        <div className={styles.loading}>
                            <Loader2 size={24} className={styles.spinner} />
                        </div>
                    ) : error ? (
                        <div className={styles.error}>
                            <p>{error}</p>
                        </div>
                    ) : report?.top_products && report.top_products.length > 0 ? (
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th style={{ textAlign: 'right' }}>Bundles Sold</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.top_products.slice(0, 10).map((item, idx) => (
                                        <tr key={idx}>
                                            <td className={styles.productCell}>{getProductName(item.product_id)}</td>
                                            <td style={{ textAlign: 'right' }} className={styles.numberCell}>
                                                {formatNumber(item.quantity)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <ShoppingCart size={32} />
                            <p>No product data</p>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
