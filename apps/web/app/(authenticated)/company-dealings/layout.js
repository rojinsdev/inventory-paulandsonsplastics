'use client';

import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { suppliersAPI, purchasesAPI } from '@/lib/api';
import { 
    Users, 
    ShoppingCart, 
    CreditCard,
    IndianRupee
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import styles from './CompanyDealings.module.css';

export default function CompanyDealingsLayout({ children }) {
    // Fetch suppliers for stats
    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers'],
        queryFn: () => suppliersAPI.getAll(),
    });

    // Fetch purchases for stats
    const { data: purchases = [] } = useQuery({
        queryKey: ['purchases'],
        queryFn: () => purchasesAPI.getAll(),
    });

    const totalOutstanding = suppliers.reduce((sum, s) => sum + (parseFloat(s.balance_due) || 0), 0);

    const stats = [
        { 
            label: 'Total Suppliers', 
            value: suppliers.length, 
            icon: Users, 
            color: 'indigo' 
        },
        { 
            label: 'Total Outstanding', 
            value: formatCurrency(totalOutstanding), 
            icon: CreditCard, 
            color: 'orange' 
        },
        { 
            label: 'Recent Purchases', 
            value: purchases.length, 
            icon: ShoppingCart, 
            color: 'blue' 
        }
    ];

    return (
        <div className={styles.container}>
            {/* Page Header is now handled by individual pages for specific titles */}

            <div className={styles.quickStats}>
                {stats.map((stat, i) => (
                    <div key={i} className={styles.statCard}>
                        <div className={styles.statIcon} style={{ 
                            backgroundColor: `var(--${stat.color}-50)`,
                            color: `var(--${stat.color}-600)`
                        }}>
                            <stat.icon size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>{stat.label}</span>
                            <span className={styles.statValue}>{stat.value}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.tabContent}>
                <Suspense fallback={
                    <div className="flex items-center justify-center min-h-[400px]">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                }>
                    {children}
                </Suspense>
            </div>
        </div>
    );
}
