'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CompanyDealingsRoot() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/company-dealings/suppliers');
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );
}
