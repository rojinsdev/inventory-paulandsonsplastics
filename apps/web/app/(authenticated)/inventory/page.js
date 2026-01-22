'use client';

import { useState, useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import { useGuide } from '@/contexts/GuideContext';
import {
    Loader2,
    Package,
    Boxes,
    PackageCheck,
    Lock,
    TrendingUp,
    TrendingDown,
} from 'lucide-react';
import { inventoryAPI } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import styles from './page.module.css';

export default function StockOverviewPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const [loading, setLoading] = useState(true);

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
                }
            ],
            components: [
                {
                    name: "Stock Cards",
                    description: "Clickable metrics that show total KGs/Units in a specific state. Yellow = WIP, Blue = Packed, Green = Saleable."
                },
                {
                    name: "Flow Diagram",
                    description: "Visual logic showing how materials progress through the factory before reaching the customer."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);
    const [error, setError] = useState(null);
    const [stockData, setStockData] = useState({
        semi_finished: 0,
        packed: 0,
        finished: 0,
        reserved: 0,
    });

    useEffect(() => {
        loadStock();
    }, []);

    const loadStock = async () => {
        try {
            setLoading(true);
            const data = await inventoryAPI.getStock();
            if (data && Array.isArray(data)) {
                const stats = {
                    semi_finished: 0,
                    packed: 0,
                    finished: 0,
                    reserved: 0,
                };

                data.forEach((item) => {
                    // Ensure state matches keys (DB uses snake_case which matches our keys)
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
            description: 'Items produced, not yet packed',
            icon: Package,
            color: 'yellow',
        },
        {
            key: 'packed',
            label: 'Packed',
            description: 'Items packed into packets',
            icon: Boxes,
            color: 'blue',
        },
        {
            key: 'finished',
            label: 'Finished',
            description: 'Bundles ready for sale',
            icon: PackageCheck,
            color: 'green',
        },
        {
            key: 'reserved',
            label: 'Reserved',
            description: 'Reserved for sales orders',
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
                    <p className="text-muted">View inventory state across all stages</p>
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
                    <button className="btn btn-secondary" onClick={loadStock}>
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
                                    <div className={styles.stockValue}>{formatNumber(value)}</div>
                                    <div className={styles.stockLabel}>{card.label}</div>
                                    <div className={styles.stockDesc}>{card.description}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Summary Cards */}
                    <div className={styles.summaryRow}>
                        <div className="card">
                            <div className="card-body">
                                <div className={styles.summaryCard}>
                                    <div className={styles.summaryIcon}>
                                        <TrendingUp size={24} />
                                    </div>
                                    <div>
                                        <div className={styles.summaryValue}>{formatNumber(totalItems)}</div>
                                        <div className={styles.summaryLabel}>Total Items (Semi + Packed)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="card">
                            <div className="card-body">
                                <div className={styles.summaryCard}>
                                    <div className={styles.summaryIcon}>
                                        <TrendingDown size={24} />
                                    </div>
                                    <div>
                                        <div className={styles.summaryValue}>{formatNumber(totalBundles)}</div>
                                        <div className={styles.summaryLabel}>Total Bundles (Finished + Reserved)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Flow Diagram */}
                    <div className="card" style={{ marginTop: 'var(--space-6)' }}>
                        <div className="card-header">
                            <h3>Inventory Flow</h3>
                        </div>
                        <div className="card-body">
                            <div className={styles.flowDiagram}>
                                <div className={styles.flowStep}>
                                    <div className={`${styles.flowIcon} ${styles.yellow}`}>
                                        <Package size={20} />
                                    </div>
                                    <span>Semi-Finished</span>
                                </div>
                                <div className={styles.flowArrow}>→</div>
                                <div className={styles.flowStep}>
                                    <div className={`${styles.flowIcon} ${styles.blue}`}>
                                        <Boxes size={20} />
                                    </div>
                                    <span>Packed</span>
                                </div>
                                <div className={styles.flowArrow}>→</div>
                                <div className={styles.flowStep}>
                                    <div className={`${styles.flowIcon} ${styles.green}`}>
                                        <PackageCheck size={20} />
                                    </div>
                                    <span>Finished</span>
                                </div>
                                <div className={styles.flowArrow}>→</div>
                                <div className={styles.flowStep}>
                                    <div className={`${styles.flowIcon} ${styles.purple}`}>
                                        <Lock size={20} />
                                    </div>
                                    <span>Reserved</span>
                                </div>
                                <div className={styles.flowArrow}>→</div>
                                <div className={styles.flowStep}>
                                    <div className={`${styles.flowIcon} ${styles.gray}`}>
                                        <Package size={20} />
                                    </div>
                                    <span>Delivered</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
