'use client';

import { useQuery } from '@tanstack/react-query';
import { suppliersAPI } from '@/lib/api';
import SuppliersTab from '../components/SuppliersTab';

export default function SuppliersPage() {
    const { data: suppliers = [], isLoading } = useQuery({
        queryKey: ['suppliers'],
        queryFn: () => suppliersAPI.getAll(),
    });

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="h3">Suppliers</h1>
                    <p className="text-muted">Manage supplier profiles and credit balances.</p>
                </div>
            </div>
            <SuppliersTab suppliers={suppliers} isLoading={isLoading} />
        </>
    );
}
