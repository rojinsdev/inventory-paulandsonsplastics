'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Global defaults
                        staleTime: 60 * 1000, // 1 minute
                        refetchOnWindowFocus: true, // Auto-refresh when user clicks back into the tab
                        retry: 1, // Retry once before failing
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
