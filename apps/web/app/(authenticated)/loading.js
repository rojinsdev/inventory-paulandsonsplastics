'use client';

import Loading from '@/components/ui/Loading';

export default function DashboardLoading() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            width: '100%'
        }}>
            <Loading fullPage={false} />
        </div>
    );
}
