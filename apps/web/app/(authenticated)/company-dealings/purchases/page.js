'use client';

import { useQuery } from '@tanstack/react-query';
import { suppliersAPI } from '@/lib/api';
import PurchasesTab from '../components/PurchasesTab';

export default function PurchasesPage() {
    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers'],
        queryFn: () => suppliersAPI.getAll(),
    });

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="h3">Purchases</h1>
                    <p className="text-muted">Log and track raw material and expense purchases.</p>
                </div>
            </div>
            <PurchasesTab suppliers={suppliers} />
        </>
    );
}
