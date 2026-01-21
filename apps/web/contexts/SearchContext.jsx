'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { productsAPI, machinesAPI, customersAPI, ordersAPI } from '@/lib/api';

const SearchContext = createContext(undefined);

export function SearchProvider({ children }) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    // Debounced search effect
    useEffect(() => {
        if (!query || query.length < 2) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timeoutId = setTimeout(async () => {
            try {
                await performSearch(query);
            } catch (error) {
                console.error('Search error:', error);
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timeoutId);
    }, [query]);

    // Perform search across multiple entities
    const performSearch = async (searchQuery) => {
        const lowerQuery = searchQuery.toLowerCase();
        const searchResults = [];

        try {
            // Search Products
            const products = await productsAPI.getAll();
            const matchingProducts = products
                .filter(p => 
                    p.product_name?.toLowerCase().includes(lowerQuery) ||
                    p.product_code?.toLowerCase().includes(lowerQuery)
                )
                .slice(0, 5)
                .map(p => ({
                    id: p.product_id,
                    title: p.product_name,
                    subtitle: `Code: ${p.product_code}`,
                    type: 'Product',
                    href: '/products',
                    icon: 'Package'
                }));
            searchResults.push(...matchingProducts);

            // Search Machines
            const machines = await machinesAPI.getAll();
            const matchingMachines = machines
                .filter(m => 
                    m.machine_name?.toLowerCase().includes(lowerQuery) ||
                    m.machine_code?.toLowerCase().includes(lowerQuery)
                )
                .slice(0, 5)
                .map(m => ({
                    id: m.machine_id,
                    title: m.machine_name,
                    subtitle: `Code: ${m.machine_code} | Type: ${m.machine_type}`,
                    type: 'Machine',
                    href: '/machines',
                    icon: 'Factory'
                }));
            searchResults.push(...matchingMachines);

            // Search Customers
            const customers = await customersAPI.getAll();
            const matchingCustomers = customers
                .filter(c => 
                    c.customer_name?.toLowerCase().includes(lowerQuery) ||
                    c.contact_person?.toLowerCase().includes(lowerQuery)
                )
                .slice(0, 5)
                .map(c => ({
                    id: c.customer_id,
                    title: c.customer_name,
                    subtitle: c.contact_person ? `Contact: ${c.contact_person}` : c.city || '',
                    type: 'Customer',
                    href: '/customers',
                    icon: 'Users'
                }));
            searchResults.push(...matchingCustomers);

            // Search Orders
            const orders = await ordersAPI.getAll();
            const matchingOrders = orders
                .filter(o => 
                    o.order_id?.toString().includes(searchQuery) ||
                    o.customer_name?.toLowerCase().includes(lowerQuery)
                )
                .slice(0, 5)
                .map(o => ({
                    id: o.order_id,
                    title: `Order #${o.order_id}`,
                    subtitle: `${o.customer_name} - ${o.status}`,
                    type: 'Order',
                    href: '/orders',
                    icon: 'ShoppingCart'
                }));
            searchResults.push(...matchingOrders);

            setResults(searchResults.slice(0, 15)); // Limit to 15 total results
        } catch (error) {
            console.error('Error performing search:', error);
            setResults([]);
        }
    };

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Cmd+F (Mac) or Ctrl+F (Windows/Linux)
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setIsOpen(true);
            }
            // ESC to close
            if (e.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Navigate to result
    const navigateToResult = useCallback((result) => {
        router.push(result.href);
        setIsOpen(false);
        setQuery('');
    }, [router]);

    const value = {
        query,
        setQuery,
        results,
        isSearching,
        isOpen,
        setIsOpen,
        navigateToResult
    };

    return (
        <SearchContext.Provider value={value}>
            {children}
        </SearchContext.Provider>
    );
}

export function useSearch() {
    const context = useContext(SearchContext);
    if (context === undefined) {
        throw new Error('useSearch must be used within a SearchProvider');
    }
    return context;
}
