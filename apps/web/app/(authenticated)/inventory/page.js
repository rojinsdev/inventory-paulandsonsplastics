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
    HardHat,
} from 'lucide-react';
import { useFactory } from '@/contexts/FactoryContext';
import { inventoryAPI, productsAPI, capsAPI } from '@/lib/api';
import { formatNumber, cn } from '@/lib/utils';
import InternalStockTable from '@/components/inventory/InternalStockTable';
import CapStockTable from '@/components/inventory/CapStockTable';
import styles from './page.module.css';

export default function StockOverviewPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const { selectedFactory, factories } = useFactory();
    const searchParams = useSearchParams();
    const initialSearch = searchParams.get('search') || '';

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('products');
    
    // Product Stock State
    const [stockRaw, setStockRaw] = useState([]);
    const [products, setProducts] = useState([]);
    const [filters, setFilters] = useState({
        search: initialSearch,
        product_id: '',
        factory_id: '',
    });

    // Cap Stock State
    const [capStock, setCapStock] = useState([]);
    const [capFilters, setCapFilters] = useState({
        search: '',
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
            
            // Fetch everything in parallel
            const [stockRes, productsRes, capsRes] = await Promise.all([
                inventoryAPI.getStock(params),
                productsAPI.getAll(params),
                capsAPI.getBalances(params)
            ]);

            // Handle Product Stock
            const stockDataArray = stockRes?.stock || stockRes?.data || (Array.isArray(stockRes) ? stockRes : []);
            setStockRaw(stockDataArray);
            setProducts(Array.isArray(productsRes) ? productsRes : (productsRes?.data || []));

            // Handle Cap Stock
            const capDataArray = capsRes?.balances || capsRes?.data || (Array.isArray(capsRes) ? capsRes : []);
            setCapStock(capDataArray);

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
            description: 'Final units ready',
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

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="h3">Internal Stock Hub</h1>
                    <p className="text-muted">Master inventory across all production stages</p>
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

                    {/* Tab Navigation */}
                    <div className={styles.tabsContainer}>
                        <div className={styles.tabsList}>
                            <button
                                onClick={() => setActiveTab('products')}
                                className={cn(
                                    styles.tabButton,
                                    activeTab === 'products' && styles.tabActive
                                )}
                            >
                                <Package size={18} />
                                <span>Products</span>
                                {activeTab === 'products' && (
                                    <div className={styles.tabIndicator} />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('caps')}
                                className={cn(
                                    styles.tabButton,
                                    activeTab === 'caps' && styles.tabActive
                                )}
                            >
                                <HardHat size={18} />
                                <span>Cap Inventory</span>
                                {activeTab === 'caps' && (
                                    <div className={styles.tabIndicator} />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Tab Content */}
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {activeTab === 'products' ? (
                            <InternalStockTable
                                stock={stockRaw}
                                products={products}
                                loading={loading}
                                filters={filters}
                                setFilters={setFilters}
                                factories={factories}
                            />
                        ) : (
                            <CapStockTable
                                stock={capStock}
                                loading={loading}
                                filters={capFilters}
                                setFilters={setCapFilters}
                                factories={factories}
                            />
                        )}
                    </div>
                </>
            )}
        </>
    );
}
