'use client';

import { Loader2, Package } from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';
import { useMemo } from 'react';
import styles from './InventoryPageTemplate.module.css';

export default function InventoryStateTable({ data, loading, type, filters = {}, products = [] }) {
    if (loading) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spinner} size={24} />
                <span>Loading inventory...</span>
            </div>
        );
    }

    // Filter data based on search and product filter
    const filteredData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        
        let result = [...data];

        // Filter by product ID if specified
        if (filters.product_id) {
            result = result.filter(item => item.product_id === filters.product_id);
        }

        // Filter by search term if specified
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            result = result.filter(item => {
                const product = products.find(p => p.id === item.product_id) || item.products;
                if (!product) return false;
                
                const productName = (product.name || '').toLowerCase();
                const size = (product.size || '').toLowerCase();
                const color = (product.color || '').toLowerCase();
                
                return productName.includes(searchLower) || 
                       size.includes(searchLower) || 
                       color.includes(searchLower);
            });
        }

        return result;
    }, [data, filters, products]);

    if (!filteredData || filteredData.length === 0) {
        return (
            <div className="card">
                <div className="empty-state">
                    <Package size={48} />
                    <p>No items found{filters.search || filters.product_id ? ' matching your filters' : ` in ${type ? type.replace('_', ' ') : 'this'} state`}.</p>
                    {(filters.search || filters.product_id) && (
                        <p className="text-muted">Try adjusting your search or filter criteria</p>
                    )}
                </div>
            </div>
        );
    }

    const getUnitLabel = (type) => {
        switch (type) {
            case 'semi_finished': return 'Items (Loose)';
            case 'packed': return 'Packets';
            case 'finished': return 'Bundles';
            case 'reserved': return 'Bundles (Reserved)';
            default: return 'Qty';
        }
    };

    return (
        <div className="card">
            <div className="card-body p-0" style={{ overflowX: 'auto' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Size / Color</th>
                            <th style={{ textAlign: 'right' }}>Quantity ({getUnitLabel(type)})</th>
                            <th style={{ textAlign: 'right' }}>Last Updated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.map((item) => {
                            const product = products.find(p => p.id === item.product_id) || item.products;
                            return (
                                <tr key={item.id}>
                                    <td className="font-medium">
                                        {product?.name || 'Unknown Product'}
                                    </td>
                                    <td>
                                        {product?.size || '—'} - {product?.color || '—'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                        {formatNumber(item.quantity)}
                                    </td>
                                    <td style={{ textAlign: 'right' }} className="text-muted">
                                        {formatDate(item.updated_at || item.last_updated || item.created_at || new Date())}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
