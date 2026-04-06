'use client';

import { useParams } from 'next/navigation';
import SupplierProfile from '../../components/SupplierProfile';

export default function SupplierProfilePage() {
    const params = useParams();
    const id = params.id;

    return <SupplierProfile supplierId={id} />;
}
