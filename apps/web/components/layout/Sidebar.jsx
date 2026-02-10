'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Boxes,
    Package,
    ShoppingCart,
    Factory,
    FileText,
    Settings,
    Users,
    ClipboardList,
    Info,
    LogOut,
    ChevronDown,
    ChevronRight,
    Truck,
    PackageCheck,
    Cuboid,
    Layers,
    Archive,
    Search,
    Timer,
    BarChart3,
    PieChart,
    LineChart,
    TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import styles from './Sidebar.module.css';

const menuSections = [
    {
        section: 'MAIN',
        items: [
            { label: 'Dashboard', href: '/', icon: LayoutDashboard },
            {
                label: 'Inventory',
                icon: Boxes,
                submenu: [
                    { label: 'Internal Stock', href: '/inventory' },
                    { label: 'Reserved', href: '/inventory/reserved' },
                    { label: 'Raw Material', href: '/inventory/raw-materials' },
                ],
            },
            {
                label: 'Sales',
                icon: ShoppingCart,
                submenu: [
                    { label: 'Live Stock', href: '/inventory/live' },
                    { label: 'Customers', href: '/customers' },
                    { label: 'Sales Orders', href: '/orders' },
                    { label: 'Deliveries', href: '/deliveries' },
                    { label: 'Payments', href: '/payments' },
                ],
            },
            {
                label: 'Production Config',
                icon: Factory,
                submenu: [
                    { label: 'Machines', href: '/machines' },
                    { label: 'Products', href: '/products' },
                    { label: 'Caps', href: '/inventory/caps' },
                    { label: 'Dies & Cycle Time', href: '/die-mappings' },
                    { label: 'Packing Rules', href: '/packing-rules' },
                ],
            },
        ]
    },
    {
        section: 'TOOLS',
        items: [
            {
                label: 'Reports',
                icon: BarChart3,
                submenu: [
                    { label: 'Production Reports', href: '/reports/production' },
                    { label: 'Inventory Reports', href: '/reports/inventory' },
                    { label: 'Sales Reports', href: '/reports/sales' },
                    { label: 'Cash Flow & Expenses', href: '/reports/cash-flow' },
                    { label: 'Analytics', href: '/reports/analytics' },
                ],
            },
            {
                label: 'Planning',
                icon: TrendingUp,
                submenu: [
                    { label: 'Demand Insights', href: '/planning/demand-insights' },
                    { label: 'Recommendations', href: '/planning/recommendations' },
                    { label: 'Forecasts', href: '/planning/forecasts' },
                ],
            },
            {
                label: 'System',
                icon: Settings,
                submenu: [
                    { label: 'Factories', href: '/factories' },
                    { label: 'User Management', href: '/users' },
                    { label: 'System Settings', href: '/system-settings' },
                    { label: 'Audit Logs', href: '/audit-logs' },
                    { label: 'System Info', href: '/system-info' },
                ],
            },
        ]
    }
];

export default function Sidebar() {
    const pathname = usePathname();
    const { logout } = useAuth();
    // Initialize state from localStorage if available, otherwise default
    const [expandedItems, setExpandedItems] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sidebar-expanded');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.error('Failed to parse sidebar state', e);
                }
            }
        }
        return ['Inventory', 'Sales'];
    });

    // Save to localStorage whenever state changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('sidebar-expanded', JSON.stringify(expandedItems));
        }
    }, [expandedItems]);

    const toggleExpand = (label) => {
        setExpandedItems(prev =>
            prev.includes(label)
                ? prev.filter(item => item !== label)
                : [...prev, label]
        );
    };

    const isActive = (href) => pathname === href;
    const isGroupActive = (submenu) => submenu?.some(item => pathname === item.href);

    return (
        <aside className={styles.sidebar}>
            {/* Workspace Header */}
            <div className={styles.header}>
                <div className={styles.logoBadge}>
                    <Layers size={20} className={styles.logoIcon} />
                </div>
                <div className={styles.orgInfo}>
                    <span className={styles.orgName}>Paul & Sons</span>
                    <span className={styles.orgRole}>Admin Portal</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className={styles.nav}>
                {menuSections.map((section) => (
                    <div key={section.section} className={styles.menuSection}>
                        <div className={styles.sectionHeader}>{section.section}</div>
                        {section.items.map((item) => {
                            const Icon = item.icon;
                            const isExpanded = expandedItems.includes(item.label);
                            const hasSubmenu = !!item.submenu;
                            // Check if parent or any child is active
                            const isParentActive = item.href ? isActive(item.href) : isGroupActive(item.submenu);

                            if (hasSubmenu) {
                                return (
                                    <div key={item.label} className={styles.menuGroup}>
                                        <button
                                            onClick={() => toggleExpand(item.label)}
                                            className={`${styles.menuItem} ${isParentActive ? styles.activeParent : ''}`}
                                        >
                                            <div className={styles.menuItemContent}>
                                                <Icon size={20} className={styles.menuIcon} />
                                                <span className={styles.menuLabel}>{item.label}</span>
                                            </div>
                                            <div className={styles.expandIcon}>
                                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                            </div>
                                        </button>
                                        {isExpanded && (
                                            <div className={styles.submenu}>
                                                <div className={styles.submenuLine}></div>
                                                <div className={styles.submenuItems}>
                                                    {item.submenu.map((subItem) => (
                                                        <Link
                                                            key={subItem.href}
                                                            href={subItem.href}
                                                            className={`${styles.submenuItem} ${isActive(subItem.href) ? styles.active : ''}`}
                                                        >
                                                            {subItem.label}
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`${styles.menuItem} ${isActive(item.href) ? styles.active : ''}`}
                                >
                                    <div className={styles.menuItemContent}>
                                        <Icon size={20} className={styles.menuIcon} />
                                        <span className={styles.menuLabel}>{item.label}</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Footer / Logout */}
            <div className={styles.footer}>
                <button onClick={logout} className={styles.logoutBtn}>
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
}
