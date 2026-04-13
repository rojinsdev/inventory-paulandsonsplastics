'use client';

import { useState, useMemo } from 'react';
import { Search, Filter, Package, HardHat, Layers, Eye } from 'lucide-react';
import { formatNumber, cn } from '@/lib/utils';
import styles from './InternalStockTable.module.css';

const STATE_COLORS = {
    'semi_finished': '#f59e0b',
    'packed': '#3b82f6', 
    'finished': '#10b981',
    'reserved': '#8b5cf6',
    'delivered': '#6b7280'
};

const STATE_LABELS = {
    'semi_finished': 'Semi-Finished',
    'packed': 'Packed', 
    'finished': 'Finished',
    'reserved': 'Reserved',
    'delivered': 'Delivered'
};

export default function CombinationStockTable({ stock, loading, filters, setFilters, factories, products = [], caps = [], inners = [] }) {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // Group and aggregate stock data by combination
    const processedStock = useMemo(() => {
        if (!stock || !Array.isArray(stock)) return [];

        // Group by combination (product + cap + inner)
        const grouped = {};
        
        stock.forEach(item => {
            // Create a unique key for each combination
            const key = `${item.product_id || 'no-product'}_${item.cap_id || 'no-cap'}_${item.inner_id || 'no-inner'}`;
            
            if (!grouped[key]) {
                // Get product info from joined data or lookup arrays
                const product = item.products || products.find(p => p.id === item.product_id);
                const cap = item.caps || caps.find(c => c.id === item.cap_id);
                const inner = item.inners || inners.find(i => i.id === item.inner_id);
                
                grouped[key] = {
                    id: key,
                    product_id: item.product_id,
                    cap_id: item.cap_id,
                    inner_id: item.inner_id,
                    product_name: product?.name || (item.product_id ? 'Unknown Product' : ''),
                    product_color: product?.color || '',
                    product_size: product?.size || '',
                    cap_name: cap?.name || (item.cap_id ? 'Unknown Cap' : ''),
                    cap_color: cap?.color || '',
                    inner_name: inner?.inner_templates?.name || inner?.name || (item.inner_id ? 'Unknown Inner' : ''),
                    inner_color: inner?.color || '',
                    factory_id: item.factory_id,
                    factory_name: factories?.find(f => f.id === item.factory_id)?.name || 'Unknown Factory',
                    states: {},
                    unitTotals: {
                        packet: 0,
                        bundle: 0,
                        loose: 0,
                    },
                    total_quantity: 0
                };
            }

            // Aggregate quantities by state
            const state = item.state;
            const quantity = Number(item.quantity) || 0;
            
            if (!grouped[key].states[state]) {
                grouped[key].states[state] = 0;
            }
            grouped[key].states[state] += quantity;
            grouped[key].total_quantity += quantity;

            const unitType = item.unit_type || 'loose';
            if (grouped[key].unitTotals[unitType] !== undefined) {
                grouped[key].unitTotals[unitType] += quantity;
            }
        });

        return Object.values(grouped);
    }, [stock, factories, products, caps, inners]);

    // Apply filters and sorting
    const filteredStock = useMemo(() => {
        let filtered = processedStock;

        // Apply search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(item => 
                item.product_name.toLowerCase().includes(searchLower) ||
                item.product_color.toLowerCase().includes(searchLower) ||
                item.cap_name.toLowerCase().includes(searchLower) ||
                item.cap_color.toLowerCase().includes(searchLower) ||
                item.inner_name.toLowerCase().includes(searchLower) ||
                item.inner_color.toLowerCase().includes(searchLower) ||
                item.factory_name.toLowerCase().includes(searchLower)
            );
        }

        // Apply factory filter
        if (filters.factory_id) {
            filtered = filtered.filter(item => item.factory_id === filters.factory_id);
        }

        // Apply state filter
        if (filters.state) {
            filtered = filtered.filter(item => item.states[filters.state] > 0);
        }

        // Apply sorting
        if (sortConfig.key) {
            filtered.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];
                
                if (typeof aVal === 'string') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }
                
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    }, [processedStock, filters, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner} />
                <p>Loading combination stock...</p>
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
                            placeholder="Search combinations..."
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            className={styles.filterInput}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <Filter className={styles.filterIcon} size={18} />
                        <select
                            value={filters.factory_id}
                            onChange={(e) => handleFilterChange('factory_id', e.target.value)}
                            className={styles.filterSelect}
                        >
                            <option value="">All Factories</option>
                            {factories?.map(factory => (
                                <option key={factory.id} value={factory.id}>
                                    {factory.name}
                                </option>
                            ))}
                        </select>
                    </div>

                </div>
            </div>

            <div className="card-body p-0" style={{ overflowX: 'auto' }}>
                <table className={`table ${styles.stickyHeader}`}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('product_name')} className={styles.sortableHeader}>
                                <span className={styles.headerContent}>
                                    <Package size={16} />
                                    <span>Product</span>
                                </span>
                            </th>
                            <th onClick={() => handleSort('cap_name')} className={styles.sortableHeader}>
                                <span className={styles.headerContent}>
                                    <HardHat size={16} />
                                    <span>Cap</span>
                                </span>
                            </th>
                            <th onClick={() => handleSort('inner_name')} className={styles.sortableHeader}>
                                <span className={styles.headerContent}>
                                    <Layers size={16} />
                                    <span>Inner</span>
                                </span>
                            </th>
                            <th onClick={() => handleSort('factory_name')} className={styles.sortableHeader}>
                                <span className={styles.headerContent}>
                                    <span>Factory</span>
                                </span>
                            </th>
                            <th className={styles.centerHeader}>Packets</th>
                            <th className={styles.centerHeader}>Bundles</th>
                            <th className={styles.centerHeader}>Loose</th>
                            <th onClick={() => handleSort('total_quantity')} className={styles.sortableHeader}>
                                <span className={styles.headerContent}>
                                    <span>Total Qty</span>
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStock.length === 0 ? (
                            <tr>
                                <td colSpan="8" className={styles.emptyState}>
                                    <Eye size={48} />
                                    <p>No combination stock found</p>
                                    <span>Try adjusting your filters</span>
                                </td>
                            </tr>
                        ) : (
                            filteredStock.map((item) => (
                                <tr key={item.id} className={styles.tableRow}>
                                    <td>
                                        <div className={styles.productInfo}>
                                            <div className={styles.productName}>{item.product_name}</div>
                                            <div className={styles.productDetails}>
                                                {item.product_size && <span>{item.product_size}</span>}
                                                {item.product_color && <span>{item.product_color}</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        {item.cap_name ? (
                                            <div className={styles.componentInfo}>
                                                <div className={styles.componentName}>{item.cap_name}</div>
                                                {item.cap_color && <div className={styles.componentColor}>{item.cap_color}</div>}
                                            </div>
                                        ) : (
                                            <span className={styles.noComponent}>No Cap</span>
                                        )}
                                    </td>
                                    <td>
                                        {item.inner_name ? (
                                            <div className={styles.componentInfo}>
                                                <div className={styles.componentName}>{item.inner_name}</div>
                                                {item.inner_color && <div className={styles.componentColor}>{item.inner_color}</div>}
                                            </div>
                                        ) : (
                                            <span className={styles.noComponent}>No Inner</span>
                                        )}
                                    </td>
                                    <td>{item.factory_name}</td>
                                    <td className={styles.quantityCell}>
                                        <span className={styles.quantity}>
                                            {formatNumber(item.unitTotals.packet || 0)}
                                        </span>
                                    </td>
                                    <td className={styles.quantityCell}>
                                        <span className={styles.quantity}>
                                            {formatNumber(item.unitTotals.bundle || 0)}
                                        </span>
                                    </td>
                                    <td className={styles.quantityCell}>
                                        <span className={styles.quantity}>
                                            {formatNumber(item.unitTotals.loose || 0)}
                                        </span>
                                    </td>
                                    <td className={styles.quantityCell}>
                                        <span className={styles.totalQuantity}>
                                            {formatNumber(item.total_quantity)}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {filteredStock.length > 0 && (
                <div className={styles.tableSummary}>
                    <span>Showing {filteredStock.length} combination{filteredStock.length !== 1 ? 's' : ''}</span>
                    <span>
                        Total Stock: {formatNumber(
                            filteredStock.reduce((sum, item) => sum + item.total_quantity, 0)
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}