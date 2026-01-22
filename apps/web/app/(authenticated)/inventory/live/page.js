'use client';

import { useState, useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import { useGuide } from '@/contexts/GuideContext';
import { Loader2, Search, Filter, Package } from 'lucide-react';
import { inventoryAPI, productsAPI } from '@/lib/api';
import { formatNumber, cn } from '@/lib/utils';
import styles from './page.module.css';

export default function LiveStockPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const [loading, setLoading] = useState(true);
    const [stock, setStock] = useState([]);
    const [products, setProducts] = useState([]);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({
        search: '',
        product_id: ''
    });

    useEffect(() => {
        setPageTitle('Live Stock');
        registerGuide({
            title: "Live Stock Feed",
            description: "Real-time view of sellable inventory only.",
            logic: [
                {
                    title: "Live Calculation",
                    explanation: "This screen filters out WIP and Reserved items. It only shows what a sales rep can promise to a customer right now."
                },
                {
                    title: "Dynamic Filtering",
                    explanation: "Search results update instantly across all attributes (Size, Color, Name) to assist in quick sales queries."
                }
            ],
            components: [
                {
                    name: "Stock Table",
                    description: "A compact list optimized for high-speed lookups during customer phone calls."
                },
                {
                    name: "Availability Badges",
                    description: "Visual cues indicating stock levels: Green for high, Amber for low-stock warnings."
                }
            ]
        });
        loadData();
    }, [registerGuide, setPageTitle]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [stockData, productsData] = await Promise.all([
                inventoryAPI.getAvailable().catch(() => []),
                productsAPI.getAll().catch(() => []),
            ]);
            setStock(Array.isArray(stockData) ? stockData : []);
            setProducts(Array.isArray(productsData) ? productsData : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Get product details
    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size}, ${p.color})` : 'Unknown';
    };

    // Filter stock
    const filteredStock = stock.filter((item) => {
        const productName = getProductName(item.product_id).toLowerCase();
        const searchMatch = productName.includes(filters.search.toLowerCase());
        const productMatch = !filters.product_id || item.product_id === filters.product_id;
        return searchMatch && productMatch;
    });

    // Calculate totals
    const totalBundles = filteredStock.reduce((sum, item) => sum + (item.quantity || 0), 0);

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Live Stock</h1>
                    <p className={styles.pageDescription}>
                        Sellable inventory ready for customer orders
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{formatNumber(totalBundles)}</div>
                        <div className={styles.statLabel}>Total Bundles Available</div>
                        <div className={styles.statSublabel}>Ready to sell</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Filter size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{filteredStock.length}</div>
                        <div className={styles.statLabel}>Product Variants</div>
                        <div className={styles.statSublabel}>Unique products</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filterBar}>
                <div className={styles.filterRow}>
                    <div className={styles.filterGroup}>
                        <Search size={16} className={styles.filterIcon} />
                        <div className={styles.searchBox}>
                            <input
                                type="text"
                                className={styles.filterInput}
                                placeholder="Search products..."
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className={styles.filterGroup}>
                        <Filter size={16} className={styles.filterIcon} />
                        <select
                            className={styles.filterSelect}
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
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading stock...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>Error: {error}</p>
                        <button className="btn btn-secondary" onClick={loadData}>
                            Retry
                        </button>
                    </div>
                ) : filteredStock.length === 0 ? (
                    <div className="empty-state">
                        <Package size={48} />
                        <p>No sellable stock available</p>
                        <p className="text-muted">Stock will appear here once bundles are created</p>
                    </div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Size</th>
                                <th>Color</th>
                                <th style={{ textAlign: 'right' }}>Available (Bundles)</th>
                                <th style={{ textAlign: 'right' }}>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStock.map((item, idx) => {
                                const product = products.find((p) => p.id === item.product_id);
                                return (
                                    <tr key={item.id || idx}>
                                        <td className="font-medium">{product?.name || 'Unknown'}</td>
                                        <td>{product?.size || '—'}</td>
                                        <td>
                                            <span className="badge badge-gray">{product?.color || '—'}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className={styles.quantity}>{formatNumber(item.quantity)}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }} className="text-muted">
                                            {item.updated_at
                                                ? new Date(item.updated_at).toLocaleDateString()
                                                : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}
