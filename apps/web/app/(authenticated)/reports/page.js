'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUI } from '@/contexts/UIContext';
import { useGuide } from '@/contexts/GuideContext';
import { Factory, Package, ShoppingCart, ArrowRight, TrendingUp, BarChart3, FileText } from 'lucide-react';
import styles from './page.module.css';

const reportTypes = [
    {
        id: 'production',
        title: 'Tub Production Reports',
        description: 'View tub production logs, efficiency metrics, and machine performance',
        icon: Factory,
        href: '/reports/production',
        color: 'purple',
        stats: [
            { label: 'Today&apos;s Tubs Produced', value: '—' },
            { label: 'Avg Efficiency', value: '—' },
        ],
    },
    {
        id: 'inventory',
        title: 'Inventory Reports',
        description: 'Track stock movements, inventory levels, and tub availability',
        icon: Package,
        href: '/reports/inventory',
        color: 'blue',
        stats: [
            { label: 'Total Items', value: '—' },
            { label: 'Total Tubs', value: '—' },
        ],
    },
    {
        id: 'sales',
        title: 'Sales Reports',
        description: 'Analyze sales performance, customer trends, and revenue metrics',
        icon: ShoppingCart,
        href: '/reports/sales',
        color: 'green',
        stats: [
            { label: 'Total Orders', value: '—' },
            { label: 'Revenue', value: '—' },
        ],
    },
];

export default function ReportsPage() {
    const { setPageTitle } = useUI();
    const { registerGuide } = useGuide();

    useEffect(() => {
        setPageTitle('Reports');
        registerGuide({
            title: "Reports Overview",
            description: "Hub for tub production, sales, and inventory analytics.",
            logic: [
                {
                    title: "Data Aggregation",
                    explanation: "Combines metrics from various system modules into specialized reporting views."
                },
                {
                    title: "Real-time Processing",
                    explanation: "Dashboard stats are computed live from the latest database transactions."
                }
            ],
            components: [
                {
                    name: "Analytics Grid",
                    description: "High-level summary cards for each reporting category."
                },
                {
                    name: "Export Toolkit",
                    description: "Quick access to system-wide data extraction tools."
                }
            ]
        });
    }, [registerGuide, setPageTitle]);
    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Reports & Analytics</h1>
                    <p className={styles.pageDescription}>
                        Access comprehensive reports and insights across tub production, inventory, and sales
                    </p>
                </div>
            </div>

            {/* Report Type Cards */}
            <div className={styles.reportsGrid}>
                {reportTypes.map((report) => {
                    const Icon = report.icon;
                    return (
                        <Link key={report.id} href={report.href} className={styles.reportCard}>
                            <div className={styles.reportCardHeader}>
                                <div className={`${styles.reportIcon} ${styles[`icon${report.color.charAt(0).toUpperCase() + report.color.slice(1)}`]}`}>
                                    <Icon size={32} />
                                </div>
                                <div className={styles.reportTitleWrapper}>
                                    <h2 className={styles.reportTitle}>{report.title}</h2>
                                    <p className={styles.reportDescription}>{report.description}</p>
                                </div>
                            </div>
                            <div className={styles.reportCardBody}>
                                <div className={styles.statsPreview}>
                                    {report.stats.map((stat, idx) => (
                                        <div key={idx} className={styles.statPreview}>
                                            <div className={styles.statPreviewLabel}>{stat.label}</div>
                                            <div className={styles.statPreviewValue}>{stat.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className={styles.reportCardFooter}>
                                <span className={styles.viewReport}>
                                    View Report
                                    <ArrowRight size={18} />
                                </span>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <div className={styles.quickActions}>
                <Link href="/reports/analytics" className={styles.actionCard}>
                    <BarChart3 size={24} className={styles.actionIcon} />
                    <div className={styles.actionContent}>
                        <h3 className={styles.actionTitle}>Analytics Dashboard</h3>
                        <p className={styles.actionDescription}>
                            View real-time analytics and key performance indicators
                        </p>
                    </div>
                </Link>
                <div className={styles.actionCard}>
                    <FileText size={24} className={styles.actionIcon} />
                    <div className={styles.actionContent}>
                        <h3 className={styles.actionTitle}>Export Reports</h3>
                        <p className={styles.actionDescription}>
                            Export any report to CSV or Excel format for further analysis
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
