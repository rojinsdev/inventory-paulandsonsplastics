'use client';

import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { factoriesAPI } from '@/lib/api';
import { useAuth } from './AuthContext';

const FactoryContext = createContext();

export function FactoryProvider({ children }) {
    const { user } = useAuth();
    const [selectedFactory, setSelectedFactory] = useState(null);

    // Initialize selectedFactory from user profile if not set
    useEffect(() => {
        if (user?.factory_id && !selectedFactory) {
            setSelectedFactory(user.factory_id);
        }
    }, [user, selectedFactory]);

    // Use React Query for shared factory data
    const {
        data: factories = [],
        isLoading: loading,
        refetch: refreshFactories
    } = useQuery({
        queryKey: ['factories'],
        queryFn: () => factoriesAPI.getAll(),
        // Stale time set to 5 minutes to avoid excessive refetching
        staleTime: 1000 * 60 * 5,
    });

    const value = useMemo(() => ({
        selectedFactory,
        setSelectedFactory,
        factories,
        loading,
        refreshFactories
    }), [selectedFactory, factories, loading, refreshFactories]);

    return (
        <FactoryContext.Provider value={value}>
            {children}
        </FactoryContext.Provider>
    );
}

export function useFactory() {
    const context = useContext(FactoryContext);
    if (!context) {
        throw new Error('useFactory must be used within a FactoryProvider');
    }
    return context;
}
