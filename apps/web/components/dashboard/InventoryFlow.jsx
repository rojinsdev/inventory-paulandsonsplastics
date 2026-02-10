'use client';

import { useRouter } from 'next/navigation';
import {
    Package,
    Boxes,
    PackageCheck,
    Lock,
    Truck,
    Database,
    PlusCircle,
    ClipboardList,
    Archive,
    ShoppingCart
} from 'lucide-react';
import { formatNumber, cn } from '@/lib/utils';
import styles from './InventoryFlow.module.css';

const stateConfig = {
    raw_material: {
        label: 'Raw Material',
        icon: Database,
        color: 'var(--slate-500)',
        action: {
            label: 'Manage Stock',
            icon: PlusCircle,
            route: '/inventory/raw-materials'
        }
    },
    semi_finished: {
        label: 'Production',
        icon: Package,
        color: 'linear-gradient(135deg, #f59e0b, #d97706)',
        action: {
            label: 'Log Output',
            icon: ClipboardList,
            route: '/production/logs'
        }
    },
    packed: {
        label: 'Packed Items',
        icon: Boxes,
        color: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        action: {
            label: 'Pack Goods',
            icon: Archive,
            route: '/inventory/packed'
        }
    },
    finished: {
        label: 'Ready for Sale',
        icon: PackageCheck,
        color: 'linear-gradient(135deg, #10b981, #059669)',
        action: {
            label: 'New Order',
            icon: ShoppingCart,
            route: '/orders'
        }
    },
    reserved: {
        label: 'Reserved/Sent',
        icon: Lock,
        color: 'linear-gradient(135deg, #6366f1, #4f46e5)',
        route: '/inventory/reserved'
    }
};

export default function InventoryFlow({ data, rawMaterialStock, compact }) {
    const router = useRouter();

    const states = ['raw_material', 'semi_finished', 'packed', 'finished', 'reserved'];

    const handleAction = (e, route) => {
        e.stopPropagation();
        if (route) {
            router.push(route);
        }
    };

    return (
        <div className={cn(styles.flowContainer, compact && styles.compact)}>
            <div className={styles.flowDiagram}>
                {states.map((state, index) => {
                    const config = stateConfig[state];
                    const Icon = config.icon;
                    const ActionIcon = config.action?.icon;

                    let quantity = 0;
                    if (state === 'raw_material') {
                        quantity = rawMaterialStock || 0;
                    } else {
                        quantity = data?.[state] || 0;
                    }

                    return (
                        <div key={state} className={styles.flowWrapper}>
                            <div className={styles.flowStep}>
                                <div className={styles.flowIcon} style={{ background: config.color }}>
                                    <Icon size={20} />
                                </div>
                                <div className={styles.flowContent}>
                                    <div className={styles.flowValue}>
                                        {formatNumber(quantity)}
                                        <span className={styles.unit}>{state === 'raw_material' ? 'kg' : ''}</span>
                                    </div>
                                    <div className={styles.flowLabel}>{config.label}</div>
                                </div>

                                {config.action && (
                                    <button
                                        className={styles.quickActionBtn}
                                        onClick={(e) => handleAction(e, config.action.route)}
                                    >
                                        <ActionIcon size={14} />
                                        <span>{config.action.label}</span>
                                    </button>
                                )}
                            </div>
                            {index < states.length - 1 && (
                                <div className={styles.flowArrow}>
                                    <div className={styles.arrowLine}></div>
                                    <div className={styles.arrowHead}></div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

