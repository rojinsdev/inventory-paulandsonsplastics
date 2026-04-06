'use client';

import { useQuery } from '@tanstack/react-query';
import { suppliersAPI } from '@/lib/api';
import PaymentHistoryTab from '../components/PaymentHistoryTab';

export default function PaymentsPage() {
    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers'],
        queryFn: () => suppliersAPI.getAll(),
    });

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="h3">Payment History</h1>
                    <p className="text-muted">Track all payments made to suppliers and settle balances.</p>
                </div>
            </div>
            <PaymentHistoryTab suppliers={suppliers} />
        </>
    );
}
