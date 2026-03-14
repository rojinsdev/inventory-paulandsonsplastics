'use strict';

import React from 'react';
import {
    PlusCircle,
    Factory,
    ShoppingCart,
    ArrowRightLeft,
    AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import styles from './StandardActionDock.module.css';

/**
 * StandardActionDock Component
 * Streamlined row of actions for the dashboard.
 */
const StandardActionDock = ({ onActionClick }) => {
    const actions = [
        {
            label: 'New Sales Order',
            icon: ShoppingCart,
            href: '/sales/orders/create',
            primary: true
        },
        {
            label: 'Log Production',
            icon: Factory,
            href: '/production/entry',
        },
        {
            label: 'Stock Transfer',
            icon: ArrowRightLeft,
            href: '/inventory/transfer',
        },
        {
            label: 'Quick Customer',
            icon: PlusCircle,
            href: '/customers/new',
        },
        {
            label: 'Check Alerts',
            icon: AlertCircle,
            href: '/inventory',
        }
    ];

    return (
        <div className={styles.actionDock}>
            {actions.map((action, index) => (
                <Link
                    key={index}
                    href={action.href}
                    className={styles.actionButton}
                    onClick={action.onClick}
                >
                    <div className={styles.iconWrapper}>
                        <action.icon size={18} />
                    </div>
                    <span className={styles.actionLabel}>{action.label}</span>
                </Link>
            ))}
        </div>
    );
};

export default StandardActionDock;
