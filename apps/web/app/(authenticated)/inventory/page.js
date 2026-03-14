'use client';

import { useState, useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import { useGuide } from '@/contexts/GuideContext';
import { useSearchParams } from 'next/navigation';
import {
    Loader2,
    Package,
    Boxes,
    PackageCheck,
    Lock,
    Truck,
    History,
    TrendingUp,
    TrendingDown,
} from 'lucide-react';
import { useFactory } from '@/contexts/FactoryContext';
import { inventoryAPI, productsAPI } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import InternalStockTable from '@/components/inventory/InternalStockTable';
import styles from './page.module.css';

export default function StockOverviewPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();
    const searchParams = useSearchParams();
    const initialSearch = searchParams.get('search') || '';

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stockRaw, setStockRaw] = useState([]);
    const [products, setProducts] = useState([]);
    const [filters, setFilters] = useState({
        search: initialSearch,
        product_id: '',
        factory_id: '',
    });
    const [stockData, setStockData] = useState({
        semi_finished: 0,
        packed: 0,
        finished: 0,
        reserved: 0,
    });

    useEffect(() => {
        setPageTitle('Inventory Overview');
        registerGuide({
            title: "Inventory Overview",
            description: "High-level view of your entire material pipeline.",
            logic: [
                {
                    title: "Stock Aggregation",
                    explanation: "Shows the total volume of materials across all 4 stages. Values represent a SUM of all warehouse logs in real-time."
                },
                {
                    title: "State Transition",
                    explanation: "Inventory moves from Semi-Finished ➔ Packed ➔ Finished ➔ Reserved. Each stage adds value or locks availability."
                },
                {
                    title: "Unified Hub",
                    explanation: "The table below shows every product's status across all stages in a single row."
                }
            ],
            components: [
                {
                    name: "Stock Cards",
                    description: "Clickable metrics that show total KGs/Units in a specific state. Yellow = WIP, Blue = Packed, Green = Saleable."
                },
                {
                    name: "Internal Stock Table",
                    description: "A product-centric view of your entire inventory."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);

    useEffect(() => {
        loadData();
    }, [selectedFactory]);

    const loadData = async () => {
        try {
            setLoading(true);
            const params = selectedFactory ? { factory_id: selectedFactory } : {};
            // Fetch all stock/products to keep the hub "Master" as requested
            const [stockRes, productsRes] = await Promise.all([
                inventoryAPI.getStock(params),
                productsAPI.getAll(params)
            ]);

            const stockDataArray = stockRes?.stock || stockRes?.data || (Array.isArray(stockRes) ? stockRes : []);
            setStockRaw(stockDataArray);
            setProducts(Array.isArray(productsRes) ? productsRes : (productsRes?.data || []));

            if (stockDataArray.length > 0) {
                const stats = {
                    semi_finished: 0,
                    packed: 0,
                    finished: 0,
                    reserved: 0,
                };

                stockDataArray.forEach((item) => {
                    if (stats.hasOwnProperty(item.state)) {
                        stats[item.state] += Number(item.quantity) || 0;
                    }
                });

                setStockData(stats);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const stockCards = [
        {
            key: 'semi_finished',
            label: 'Semi-Finished',
            description: 'Loose items',
            icon: Package,
            color: 'yellow',
        },
        {
            key: 'packed',
            label: 'Packed',
            description: 'Packets ready',
            icon: Boxes,
            color: 'blue',
        },
        {
            key: 'finished',
            label: 'Finished',
            description: 'Bundles ready',
            icon: PackageCheck,
            color: 'green',
        },
        {
            key: 'reserved',
            label: 'Reserved',
            description: 'Locked for orders',
            icon: Lock,
            color: 'purple',
        },
    ];

    const totalItems = stockData.semi_finished + stockData.packed;
    const totalBundles = stockData.finished + stockData.reserved;

    return (
        <>
            <div className="page-header">
                <div>
                    <p className="text-muted">Master Internal Stock Hub</p>
                </div>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <Loader2 size={32} className={styles.spinner} />
                    <span>Loading stock data...</span>
                </div>
            ) : error ? (
                <div className={styles.error}>
                    <p>Error: {error}</p>
                    <button className="btn btn-secondary" onClick={loadData}>
                        Retry
                    </button>
                </div>
            ) : (
                <>
                    {/* Stock State Cards */}
                    <div className={styles.stockGrid}>
                        {stockCards.map((card) => {
                            const Icon = card.icon;
                            const value = stockData[card.key];
                            return (
                                <div key={card.key} className={styles.stockCard}>
                                    <div className={`${styles.stockIcon} ${styles[card.color]}`}>
                                        <Icon size={24} />
                                    </div>
                                    <div className={styles.stockContent}>
                                        <div className={styles.stockValue}>{formatNumber(value)}</div>
                                        <div className={styles.stockLabel}>{card.label}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            {card.description}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Unified Stock Table */}
                    <div style={{ marginTop: '2.5rem' }}>
                        <div className="page-header" style={{ marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Internal Stock Levels</h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Real-time inventory across all production stages</p>
                            </div>
                        </div>
                        <InternalStockTable
                            stock={stockRaw}
                            products={products}
                            loading={loading}
                            filters={filters}
                            setFilters={setFilters}
                            factories={factories}
                        />
                    </div>

                </>
            )}
        </>
    );
}
