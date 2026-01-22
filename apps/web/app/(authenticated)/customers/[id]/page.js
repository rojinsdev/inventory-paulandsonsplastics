'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUI } from '@/contexts/UIContext';
import { ArrowLeft, TrendingUp, ShoppingCart, Calendar, Tag, Loader2, Plus } from 'lucide-react';
import { customersAPI } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import styles from './page.module.css';

export default function CustomerDetailPage() {
    const { setPageTitle } = useUI();
    const params = useParams();
    const router = useRouter();
    const customerId = params.id;

    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        setPageTitle('Customer Profile');
        loadCustomerProfile();
    }, [customerId]);

    const loadCustomerProfile = async () => {
        try {
            setLoading(true);
            const data = await customersAPI.getProfile(customerId);
            setProfile(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <>
                <div className={styles.loading}>
                    <Loader2 size={32} className={styles.spinner} />
                    <p>Loading customer profile...</p>
                </div>
            </>
        );
    }

    if (error || !profile) {
        return (
            <>
                <div className={styles.error}>
                    <p>Error: {error || 'Customer not found'}</p>
                    <button className="btn btn-secondary" onClick={() => router.push('/customers')}>
                        Back to Customers
                    </button>
                </div>
            </>
        );
    }

    const { customer, analytics, recentOrders, recentInteractions } = profile;

    return (
        <div className={styles.contentWrapper}>
            <style jsx>{`
                .${styles.contentWrapper} {
                    padding: 0;
                }
            `}</style>
            {/* Header */}
            <div className={styles.header}>
                <button className={styles.backButton} onClick={() => router.push('/customers')}>
                    <ArrowLeft size={20} />
                    <span>Back to Customers</span>
                </button>

                <div className={styles.headerContent}>
                    <div>
                        <h1 className={styles.customerName}>{customer.name}</h1>
                        <div className={styles.customerMeta}>
                            {customer.phone && <span>{customer.phone}</span>}
                            {customer.email && <span>{customer.email}</span>}
                            {analytics && (
                                <span className={styles.segment} data-segment={analytics.customer_segment}>
                                    {analytics.customer_segment.toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            {analytics && (
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'var(--primary-light)' }}>
                            <ShoppingCart size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{analytics.total_orders}</div>
                            <div className={styles.statLabel}>Total Orders</div>
                            <div className={styles.statSublabel}>{analytics.delivered_orders} delivered</div>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'var(--success-light)' }}>
                            <TrendingUp size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{formatCurrency(analytics.total_purchase_value)}</div>
                            <div className={styles.statLabel}>Total Purchase Value</div>
                            <div className={styles.statSublabel}>Avg: {formatCurrency(analytics.average_order_value)}</div>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'var(--warning-light)' }}>
                            <Calendar size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>
                                {analytics.days_since_last_order !== null ? `${analytics.days_since_last_order}d` : 'N/A'}
                            </div>
                            <div className={styles.statLabel}>Days Since Last Order</div>
                            <div className={styles.statSublabel}>
                                {analytics.last_purchase_date ? formatDate(analytics.last_purchase_date) : 'No orders'}
                            </div>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'var(--info-light)' }}>
                            <Tag size={24} />
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statValue}>{analytics.most_purchased_product_quantity || 0}</div>
                            <div className={styles.statLabel}>Most Purchased Product</div>
                            <div className={styles.statSublabel}>
                                {analytics.most_purchased_product_name || 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'orders' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('orders')}
                >
                    Purchase History ({recentOrders?.length || 0})
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'interactions' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('interactions')}
                >
                    Interactions ({recentInteractions?.length || 0})
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'profile' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('profile')}
                >
                    Profile Details
                </button>
            </div>

            {/* Tab Content */}
            <div className={styles.tabContent}>
                {activeTab === 'overview' && (
                    <div className={styles.overview}>
                        <div className={styles.overviewSection}>
                            <h3>Customer Information</h3>
                            <div className={styles.infoGrid}>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Customer Type</span>
                                    <span className={styles.infoValue}>{customer.type || 'N/A'}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Payment Terms</span>
                                    <span className={styles.infoValue}>{customer.payment_terms || 'N/A'}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>Credit Limit</span>
                                    <span className={styles.infoValue}>{formatCurrency(customer.credit_limit || 0)}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <span className={styles.infoLabel}>GST Number</span>
                                    <span className={styles.infoValue}>{customer.gstin || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {analytics && (
                            <div className={styles.overviewSection}>
                                <h3>Analytics Summary</h3>
                                <div className={styles.infoGrid}>
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>Customer Segment</span>
                                        <span className={styles.infoValue}>
                                            <span className={styles.segment} data-segment={analytics.customer_segment}>
                                                {analytics.customer_segment.toUpperCase()}
                                            </span>
                                        </span>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>Risk Level</span>
                                        <span className={styles.infoValue}>
                                            <span className={styles.riskBadge} data-risk={analytics.risk_level}>
                                                {analytics.risk_level.toUpperCase()}
                                            </span>
                                        </span>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>First Purchase</span>
                                        <span className={styles.infoValue}>
                                            {analytics.first_purchase_date ? formatDate(analytics.first_purchase_date) : 'N/A'}
                                        </span>
                                    </div>
                                    <div className={styles.infoItem}>
                                        <span className={styles.infoLabel}>Avg Days Between Orders</span>
                                        <span className={styles.infoValue}>
                                            {analytics.average_days_between_orders ? `${Math.round(analytics.average_days_between_orders)} days` : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {customer.notes && (
                            <div className={styles.overviewSection}>
                                <h3>Notes</h3>
                                <p className={styles.notes}>{customer.notes}</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'orders' && (
                    <div className={styles.ordersTab}>
                        <div className="card">
                            {recentOrders && recentOrders.length > 0 ? (
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Order Date</th>
                                            <th>Status</th>
                                            <th>Items</th>
                                            <th>Total Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentOrders.map((order) => (
                                            <tr key={order.id}>
                                                <td>{formatDate(order.order_date)}</td>
                                                <td>
                                                    <span className={`badge badge-${order.status}`}>
                                                        {order.status}
                                                    </span>
                                                </td>
                                                <td>{order.sales_order_items?.length || 0} items</td>
                                                <td className="font-medium">{formatCurrency(order.total_amount || 0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="empty-state">
                                    <ShoppingCart size={48} />
                                    <p>No orders yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'interactions' && (
                    <div className={styles.interactionsTab}>
                        <div className="card">
                            {recentInteractions && recentInteractions.length > 0 ? (
                                <div className={styles.timeline}>
                                    {recentInteractions.map((interaction) => (
                                        <div key={interaction.id} className={styles.timelineItem}>
                                            <div className={styles.timelineDot}></div>
                                            <div className={styles.timelineContent}>
                                                <div className={styles.timelineHeader}>
                                                    <span className={styles.interactionType}>
                                                        {interaction.interaction_type.replace('_', ' ')}
                                                    </span>
                                                    <span className={styles.timelineDate}>
                                                        {formatDate(interaction.created_at)}
                                                    </span>
                                                </div>
                                                {interaction.description && (
                                                    <p className={styles.timelineDescription}>{interaction.description}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <Calendar size={48} />
                                    <p>No interactions recorded</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className={styles.profileTab}>
                        <div className="card">
                            <h3>Contact Information</h3>
                            <div className={styles.profileGrid}>
                                <div className={styles.profileItem}>
                                    <label>Name</label>
                                    <p>{customer.name}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Phone</label>
                                    <p>{customer.phone || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Email</label>
                                    <p>{customer.email || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Address</label>
                                    <p>{customer.address || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>City</label>
                                    <p>{customer.city || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>State</label>
                                    <p>{customer.state || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Pincode</label>
                                    <p>{customer.pincode || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>GST Number</label>
                                    <p>{customer.gstin || '—'}</p>
                                </div>
                            </div>

                            <h3 style={{ marginTop: '2rem' }}>Business Details</h3>
                            <div className={styles.profileGrid}>
                                <div className={styles.profileItem}>
                                    <label>Customer Type</label>
                                    <p>{customer.type || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Payment Terms</label>
                                    <p>{customer.payment_terms || '—'}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Credit Limit</label>
                                    <p>{formatCurrency(customer.credit_limit || 0)}</p>
                                </div>
                                <div className={styles.profileItem}>
                                    <label>Status</label>
                                    <p>{customer.is_active ? 'Active' : 'Inactive'}</p>
                                </div>
                            </div>

                            {customer.tags && customer.tags.length > 0 && (
                                <>
                                    <h3 style={{ marginTop: '2rem' }}>Tags</h3>
                                    <div className={styles.tags}>
                                        {customer.tags.map((tag, index) => (
                                            <span key={index} className={styles.tag}>{tag}</span>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
