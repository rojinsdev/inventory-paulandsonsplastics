'use client';

import { useRealtime } from '@/hooks/useRealtime';

export default function RealtimeHandler() {
    useRealtime();
    return null; // This component doesn't render anything
}
