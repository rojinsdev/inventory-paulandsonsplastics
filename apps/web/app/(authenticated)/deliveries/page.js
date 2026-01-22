'use client';

import { useState, useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';
import { Loader2, Truck, CheckCircle, Clock, Package } from 'lucide-react';
import { ordersAPI, customersAPI, productsAPI } from '@/lib/api';
import { useGuide } from '@/contexts/GuideContext';
import { formatDate, cn } from '@/lib/utils';
import styles from './page.module.css';

export default function DeliveriesPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();
    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [delivering, setDelivering] = useState(null);

    useEffect(() => {
        setPageTitle('Deliveries');
        registerGuide({
            title: "Delivery Management",
            description: "Final stage of the sales pipeline: Dispatching goods to the client.",
            logic: [
                {
                    title: "Transaction Finalization",
                    explanation: "Marking as delivered is the final accounting step. It permanently deducts stock from 'Reserved' and completes the financial loop."
                },
                {
                    title: "Dispatch Queue",
                    explanation: "Only orders with successfully 'Reserved' stock appear here. This prevents shipping items that aren't physically ready."
                }
            ],
            components: [
                {
                    name: "Customer Shipment Cards",
                    description: "Visual summaries of what needs to go into the truck for each customer."
                },
                {
                    name: "Verification Check",
                    description: "Forces a second confirmation before stock is permanently removed from the warehouse ledger."
                }
            ]
        });
        loadData();
    }, [registerGuide]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [ordersData, customersData, productsData] = await Promise.all([
                ordersAPI.getAll({ status: 'reserved' }).catch(() => []),
                customersAPI.getAll().catch(() => []),
                productsAPI.getAll().catch(() => []),
            ]);
            setOrders(Array.isArray(ordersData) ? ordersData : []);
            setCustomers(Array.isArray(customersData) ? customersData : []);
            setProducts(Array.isArray(productsData) ? productsData : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getCustomerName = (id) => customers.find((c) => c.id === id)?.name || 'Unknown';
    const getProductName = (id) => {
        const p = products.find((p) => p.id === id);
        return p ? `${p.name} (${p.size})` : 'Unknown';
    };

    const handleDeliver = async (order) => {
        if (!confirm(`Mark order #${order.id?.slice(-6).toUpperCase()} as delivered?`)) return;

        setDelivering(order.id);
        try {
            await ordersAPI.deliver(order.id);
            loadData();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setDelivering(null);
        }
    };

    const pendingCount = orders.length;
    const totalBundles = orders.reduce(
        (sum, order) => sum + (order.sales_order_items?.reduce((s, i) => s + (i.quantity_bundles || 0), 0) || 0),
        0
    );

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Deliveries</h1>
                    <p className={styles.pageDescription}>
                        Reserved orders ready for delivery
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Clock size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{pendingCount}</div>
                        <div className={styles.statLabel}>Pending Deliveries</div>
                        <div className={styles.statSublabel}>Awaiting processing</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={28} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{totalBundles}</div>
                        <div className={styles.statLabel}>Total Bundles to Deliver</div>
                        <div className={styles.statSublabel}>Ready for shipment</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading deliveries...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>Error: {error}</p>
                        <button className="btn btn-secondary" onClick={loadData}>
                            Retry
                        </button>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="empty-state">
                        <Truck size={48} />
                        <p>No pending deliveries</p>
                        <p className="text-muted">Reserved orders appear here for delivery processing</p>
                    </div>
                ) : (
                    <div className={styles.deliveryList}>
                        {orders.map((order) => (
                            <div key={order.id} className={styles.deliveryCard}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <div className={styles.orderId}>
                                            Order #{order.id?.slice(-6).toUpperCase()}
                                        </div>
                                        <div className={styles.customerName}>
                                            {getCustomerName(order.customer_id)}
                                        </div>
                                    </div>
                                    <div className={styles.orderDate}>{formatDate(order.created_at)}</div>
                                </div>

                                <div className={styles.itemsList}>
                                    {order.sales_order_items?.map((item, idx) => (
                                        <div key={idx} className={styles.itemRow}>
                                            <span className={styles.itemProduct}>
                                                {getProductName(item.product_id)}
                                            </span>
                                            <span className={styles.itemQty}>{item.quantity_bundles} bundles</span>
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.cardFooter}>
                                    <div className={styles.totalBundles}>
                                        Total: {order.sales_order_items?.reduce((s, i) => s + (i.quantity_bundles || 0), 0) || 0} bundles
                                    </div>
                                    <button
                                        className={styles.deliverButton}
                                        onClick={() => handleDeliver(order)}
                                        disabled={delivering === order.id}
                                    >
                                        {delivering === order.id ? (
                                            <>
                                                <Loader2 size={16} className={styles.spinner} />
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle size={16} />
                                                Mark Delivered
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
