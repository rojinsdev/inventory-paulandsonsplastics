'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useRealtime() {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!supabase) return;

        console.log('📡 Supabase Realtime: Initializing listeners...');

        // 1. Listen for Production Changes
        const productionChannel = supabase
            .channel('production-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'production_logs' },
                (payload) => {
                    console.log('🔄 Realtime: Production change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                }
            )
            .subscribe();

        // 2. Listen for Raw Material Changes
        const materialChannel = supabase
            .channel('material-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'raw_materials' },
                (payload) => {
                    console.log('🔄 Realtime: Material change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                }
            )
            .subscribe();

        // 3. Listen for Order Changes
        const orderChannel = supabase
            .channel('order-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'sales_orders' },
                (payload) => {
                    console.log('🔄 Realtime: Order change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['orders'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                }
            )
            .subscribe();

        // 4. Listen for Stock Changes
        const stockChannel = supabase
            .channel('stock-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'stock_balances' },
                (payload) => {
                    console.log('🔄 Realtime: Stock balance change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                }
            )
            .subscribe();

        // 5. Listen for Customer Changes
        const customerChannel = supabase
            .channel('customer-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'customers' },
                (payload) => {
                    console.log('🔄 Realtime: Customer change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['customers'] });
                    queryClient.invalidateQueries({ queryKey: ['customer'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                }
            )
            .subscribe();

        // 6. Listen for Machine Changes
        const machineChannel = supabase
            .channel('machine-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'machines' },
                (payload) => {
                    console.log('🔄 Realtime: Machine change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['machines'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                }
            )
            .subscribe();

        // 7. Listen for Product Changes
        const productChannel = supabase
            .channel('product-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
                (payload) => {
                    console.log('🔄 Realtime: Product change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['products'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                }
            )
            .subscribe();

        // 8. Listen for Die Mapping Changes
        const dieMappingChannel = supabase
            .channel('die-mapping-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'die_mappings' },
                (payload) => {
                    console.log('🔄 Realtime: Die mapping change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['die-mappings'] });
                }
            )
            .subscribe();

        // 9. Listen for System Setting Changes
        const settingChannel = supabase
            .channel('setting-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'system_settings' },
                (payload) => {
                    console.log('🔄 Realtime: System settings change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['system-settings'] });
                }
            )
            .subscribe();

        // 10. Listen for Audit Log Changes
        const auditChannel = supabase
            .channel('audit-changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'audit_logs' },
                (payload) => {
                    console.log('🔄 Realtime: New audit log detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
                }
            )
            .subscribe();

        // 11. Listen for User Changes
        const userChannel = supabase
            .channel('user-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'users' },
                (payload) => {
                    console.log('🔄 Realtime: User change detected', payload);
                    queryClient.invalidateQueries({ queryKey: ['users'] });
                }
            )
            .subscribe();

        // Cleanup on unmount
        return () => {
            console.log('📡 Supabase Realtime: Cleaning up listeners...');
            supabase.removeChannel(productionChannel);
            supabase.removeChannel(materialChannel);
            supabase.removeChannel(orderChannel);
            supabase.removeChannel(stockChannel);
            supabase.removeChannel(customerChannel);
            supabase.removeChannel(machineChannel);
            supabase.removeChannel(productChannel);
            supabase.removeChannel(dieMappingChannel);
            supabase.removeChannel(settingChannel);
            supabase.removeChannel(auditChannel);
            supabase.removeChannel(userChannel);
        };
    }, [queryClient]);
}
