'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
    Menu,
    Handshake,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useUI } from '@/contexts/UIContext';
import styles from './Sidebar.module.css';

const menuSections = [
    {
        section: 'MAIN',
        items: [
            { label: 'Home', href: '/', icon: LayoutDashboard },
            {
                label: 'Sales',
                icon: ShoppingCart,
                submenu: [
                    { label: 'Customers', href: '/customers' },
                    { label: 'Sales Orders', href: '/orders' },
                    { label: 'Deliveries', href: '/deliveries' },
                    { label: 'Payments', href: '/payments' },
                    { label: 'Sales History', href: '/sales-history' },
                ],
            },
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
                label: 'Config',
                icon: Factory,
                submenu: [
                    { label: 'Machines', href: '/machines' },
                    { label: 'Tubs', href: '/products' },
                    { label: 'Caps', href: '/inventory/caps' },
                    { label: 'Inners', href: '/inventory/inners' },
                    { label: 'Cap Mapping', href: '/cap-mappings' },
                    { label: 'Tub Mapping', href: '/die-mappings' },
                    { label: 'Packing Rules', href: '/packing-rules' },
                ],
            },
        ]
    },
    {
        section: 'TOOLS',
        items: [
            {
                label: 'Purchases',
                icon: Handshake,
                submenu: [
                    { label: 'Suppliers', href: '/company-dealings/suppliers' },
                    { label: 'Purchases', href: '/company-dealings/purchases' },
                    { label: 'Payment History', href: '/company-dealings/payments' },
                ],
            },
            {
                label: 'Reports',
                icon: BarChart3,
                submenu: [
                    { label: 'Tub Production Reports', href: '/reports/production' },
                    { label: 'Inventory Reports', href: '/reports/inventory' },
                    { label: 'Sales Reports', href: '/reports/sales' },
                    { label: 'Cash Flow & Expenses', href: '/reports/cash-flow' },
                    { label: 'Analytics', href: '/reports/analytics' },
                    { label: 'Statistics', href: '/statistics' },
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
                    { label: 'Initial Stock Loading', href: '/config/initial-stock' },
                    { label: 'System Settings', href: '/system-settings' },
                    { label: 'System Health', href: '/system-health' },
                    { label: 'Audit Logs', href: '/audit-logs' },
                    { label: 'System Info', href: '/system-info' },
                ],
            },
        ]
    }
];

export default function Sidebar() {
    const { isSidebarCollapsed, toggleSidebar } = useUI();
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
        if (isSidebarCollapsed) {
            toggleSidebar();
            setExpandedItems([label]);
            return;
        }
        setExpandedItems(prev =>
            prev.includes(label)
                ? prev.filter(item => item !== label)
                : [...prev, label]
        );
    };

    const isActive = (href) => pathname === href;
    const isGroupActive = (submenu) => submenu?.some(item => pathname === item.href);

    return (
        <aside className={`${styles.sidebar} ${isSidebarCollapsed ? styles.collapsed : ''}`}>
            {/* Workspace Header */}
            <div className={styles.header}>
                <div className={styles.headerMain}>
                    <div className={styles.logoBadge}>
                        <Image 
                            src="/logo.svg" 
                            alt="Paul & Sons Logo" 
                            width={40} 
                            height={40} 
                            className={styles.logoImage}
                        />
                    </div>
                    {!isSidebarCollapsed && (
                        <div className={styles.orgInfo}>
                            <span className={styles.orgName}>Paul & Sons</span>
                            <span className={styles.orgRole}>Admin Portal</span>
                        </div>
                    )}
                </div>
                <button 
                    className={styles.toggleBtn} 
                    onClick={toggleSidebar}
                    title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    <Menu size={20} />
                </button>
            </div>

            {/* Navigation */}
            <nav className={styles.nav}>
                {menuSections.map((section) => (
                    <div key={section.section} className={styles.menuSection}>
                        {!isSidebarCollapsed && <div className={styles.sectionHeader}>{section.section}</div>}
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
                                            title={isSidebarCollapsed ? item.label : ''}
                                        >
                                            <div className={styles.menuItemContent}>
                                                <Icon size={20} className={styles.menuIcon} />
                                                {!isSidebarCollapsed && <span className={styles.menuLabel}>{item.label}</span>}
                                            </div>
                                            {!isSidebarCollapsed && (
                                                <div className={styles.expandIcon}>
                                                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                </div>
                                            )}
                                        </button>
                                        {!isSidebarCollapsed && isExpanded && (
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
                                    title={isSidebarCollapsed ? item.label : ''}
                                >
                                    <div className={styles.menuItemContent}>
                                        <Icon size={20} className={styles.menuIcon} />
                                        {!isSidebarCollapsed && <span className={styles.menuLabel}>{item.label}</span>}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Footer / Logout */}
            <div className={styles.footer}>
                <button onClick={logout} className={styles.logoutBtn} title={isSidebarCollapsed ? "Logout" : ""}>
                    <LogOut size={20} />
                    {!isSidebarCollapsed && <span>Logout</span>}
                </button>
            </div>
        </aside>
    );
}
