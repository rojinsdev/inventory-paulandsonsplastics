'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUI } from '@/contexts/UIContext';
import { useFactory } from '@/contexts/FactoryContext';
import InventoryStateTable from './InventoryStateTable';
import { inventoryAPI, productsAPI } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import { Package, Boxes, PackageCheck, Lock, Search, Filter } from 'lucide-react';
import { useGuide } from '@/contexts/GuideContext';
import styles from './InventoryPageTemplate.module.css';

// Icon and color mapping for each state type
const stateConfig = {
    semi_finished: {
        icon: Package,
        colorGradient: 'linear-gradient(135deg, #f59e0b, #d97706)', // yellow
    },
    packed: {
        icon: Boxes,
        colorGradient: 'linear-gradient(135deg, #3b82f6, #2563eb)', // blue
    },
    finished: {
        icon: PackageCheck,
        colorGradient: 'linear-gradient(135deg, #10b981, #059669)', // green
    },
    reserved: {
        icon: Lock,
        colorGradient: 'linear-gradient(135deg, #6366f1, #4f46e5)', // indigo
    },
};

export default function InventoryPageTemplate({ title, type, description, guide }) {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory } = useFactory();
    const [data, setData] = useState([]);

    useEffect(() => {
        setPageTitle(title);
        if (guide) {
            registerGuide(guide);
        }
    }, [guide, registerGuide, setPageTitle, title]);

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({
        search: '',
        product_id: '',
    });

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const params = selectedFactory ? { factory_id: selectedFactory } : {};
            const [stockResult, productsResult] = await Promise.all([
                inventoryAPI.getStock(params).catch(() => ({ stock: [] })),
                productsAPI.getAll(params).catch(() => ({ products: [] })),
            ]);

            const stockData = stockResult?.stock || stockResult?.data || (Array.isArray(stockResult) ? stockResult : []);
            const productsData = productsResult?.products || productsResult?.data || (Array.isArray(productsResult) ? productsResult : []);

            setData(stockData);
            setProducts(productsData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedFactory]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Filter data for the specific type
    const filteredByType = useMemo(() => {
        if (!data) return [];
        return data.filter(item => item.state === type);
    }, [data, type]);

    // Calculate stats from filtered data
    const stats = useMemo(() => {
        const totalQuantity = filteredByType.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        const productVariants = new Set(filteredByType.map(item => item.product_id)).size;
        return { totalQuantity, productVariants };
    }, [filteredByType]);

    const config = stateConfig[type] || { icon: Package, colorGradient: 'linear-gradient(135deg, #6b7280, #4b5563)' };
    const Icon = config.icon;

    return (
        <>
            {/* Enhanced Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>{title}</h1>
                    <p className={styles.pageDescription}>{description}</p>
                </div>
                <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
                    Refresh
                </button>
            </div>

            {/* Stats Cards */}
            {!loading && !error && (
                <div className={styles.statsRow}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: config.colorGradient }}>
                            <Icon size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{formatNumber(stats.totalQuantity)}</div>
                            <div className={styles.statLabel}>Total Quantity</div>
                            <div className={styles.statSublabel}>
                                {type === 'semi_finished' ? 'Tubs (Loose)' :
                                    type === 'packed' ? 'Packets' :
                                        type === 'finished' ? 'Tubs' :
                                            type === 'reserved' ? 'Tubs (Reserved)' : 'Units'}
                            </div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                            <Filter size={28} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{stats.productVariants}</div>
                            <div className={styles.statLabel}>Tub Variants</div>
                            <div className={styles.statSublabel}>Unique tubs</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            {!loading && !error && filteredByType.length > 0 && (
                <div className={styles.filterBar}>
                    <div className={styles.filterRow}>
                        <div className={styles.filterGroup}>
                            <Search size={16} className={styles.filterIcon} />
                            <div className={styles.searchBox}>
                                <input
                                    type="text"
                                    className={styles.filterInput}
                                    placeholder="Search tubs..."
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
                                <option value="">All Tubs</option>
                                {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} ({p.size})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className={styles.error}>
                    <p>Error: {error}</p>
                    <button className="btn btn-secondary" onClick={loadData}>
                        Retry
                    </button>
                </div>
            )}

            {/* Table Component */}
            <InventoryStateTable
                data={filteredByType}
                loading={loading}
                type={type}
                filters={filters}
                products={products}
            />
        </>
    );
}
