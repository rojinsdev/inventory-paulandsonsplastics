import { SalesOrderService } from '../sales-order.service';
import { supabase } from '../../../config/supabase';
import { cashFlowService } from '../../cash-flow/cash-flow.service';

// Mock Dependencies
jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: jest.fn(),
        rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    }
}));
jest.mock('../../inventory/inventory.service');
jest.mock('../../cash-flow/cash-flow.service');
jest.mock('../../audit/audit.service', () => {
    return {
        AuditService: jest.fn().mockImplementation(() => ({
            logAction: jest.fn().mockResolvedValue(true)
        }))
    };
});

describe('Sales & Credit Integration - Partial Payment Loop', () => {
    let service: SalesOrderService;
    let mockFrom: any;

    const createChain = (data: any, error: any = null) => {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.gt = jest.fn().mockReturnValue(chain);
        chain.lt = jest.fn().mockReturnValue(chain);
        chain.in = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] : (data === null ? null : data), error });
        chain.single = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] : data, error });
        chain.update = jest.fn().mockReturnValue(chain);
        chain.insert = jest.fn().mockReturnValue(chain);
        chain.delete = jest.fn().mockReturnValue(chain);
        chain.upsert = jest.fn().mockResolvedValue({ error });
        chain.then = (resolve: any) => resolve({ data, error });
        return chain;
    };

    beforeEach(() => {
        service = new SalesOrderService();
        jest.clearAllMocks();
        mockFrom = supabase.from;
        (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
    });

    it('should handle the full partial payment cycle correctly', async () => {
        // SCENARIO: bill of ₹1,00,000, pays ₹15,000 immediately, then pays ₹50,000 later.

        const orderId = 'order-100k';
        const customerId = 'party-99';
        const userId = 'admin-1';

        const mockOrder = {
            id: orderId,
            status: 'reserved',
            customer_id: customerId,
            sales_order_items: [
                { id: 'item-1', product_id: 'prod-1', quantity: 10, unit_type: 'bundle', is_backordered: false, products: { factory_id: 'fac-1' } }
            ]
        };

        const deliveryData = {
            items: [{ item_id: 'item-1', quantity: 10, unit_price: 10000 }], // Total 100,000
            payment_mode: 'credit' as const,
            initial_payment: 15000,
            user_id: userId
        };

        const orderUpdateSpy = jest.fn().mockReturnValue(createChain({}));
        const paymentInsertSpy = jest.fn().mockReturnValue(createChain({}));

        mockFrom.mockImplementation((table: string) => {
            if (table === 'sales_orders') {
                const chain = createChain(mockOrder);
                chain.update = jest.fn().mockImplementation((updates) => {
                    // Capture updates to verify balance
                    if (updates.balance_due !== undefined) orderUpdateSpy(updates);
                    return chain;
                });
                return chain;
            }
            if (table === 'sales_order_items') return createChain([{ quantity: 10, quantity_shipped: 10, unit_price: 10000 }]);
            if (table === 'dispatch_records') return createChain({ id: 'disp-100k' });
            if (table === 'payments') {
                const chain = createChain({});
                chain.insert = paymentInsertSpy;
                return chain;
            }
            if (table === 'stock_balances') return createChain([{ quantity: 1000 }]);
            if (table === 'notifications') return createChain({});
            return createChain([]);
        });

        (cashFlowService.getCategoryId as jest.Mock).mockResolvedValue('cat-sales');

        // 1. Process initial delivery with ₹15,000 payment
        await service.processDelivery(orderId, deliveryData);

        // Verify initial balance (100,000 - 15,000 = 85,000)
        expect(orderUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
            total_amount: 100000,
            amount_paid: 15000,
            balance_due: 85000
        }));

        // Verify payment record
        expect(paymentInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
            amount: 15000,
            customer_id: customerId
        }));

        // 2. Record second payment of ₹50,000
        // Update mockOrder with current state for the next call
        const orderAfterFirstPayment = {
            ...mockOrder,
            status: 'delivered',
            total_amount: 100000,
            amount_paid: 15000,
            balance_due: 85000,
            created_by: userId
        };

        // Reset spies for the second payment
        orderUpdateSpy.mockClear();
        paymentInsertSpy.mockClear();

        mockFrom.mockImplementation((table: string) => {
            if (table === 'sales_orders') {
                const chain = createChain(orderAfterFirstPayment);
                chain.update = jest.fn().mockImplementation((updates) => {
                    if (updates.balance_due !== undefined) orderUpdateSpy(updates);
                    return chain;
                });
                return chain;
            }
            if (table === 'sales_order_items') return createChain([{ quantity: 10, quantity_shipped: 10, unit_price: 10000 }]);
            if (table === 'dispatch_records') return createChain({ id: 'disp-100k' });
            if (table === 'payments') {
                const chain = createChain({});
                chain.insert = paymentInsertSpy;
                return chain;
            }
            if (table === 'stock_balances') return createChain([{ quantity: 1000 }]);
            if (table === 'notifications') return createChain({});
            return createChain([]);
        });

        await service.recordPayment(orderId, {
            amount: 50000, // Let's use 50k as per scenario
            payment_method: 'Cash',
            user_id: userId
        });

        // Verify second balance (85,000 - 50,000 = 35,000)
        expect(orderUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
            amount_paid: 65000, // 15000 + 50000
            balance_due: 35000  // 85000 - 50000
        }));

        // Verify second payment record
        expect(paymentInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
            amount: 50000,
            customer_id: customerId
        }));
    });

    it('should correctly mark orders as overdue and send notifications', async () => {
        const userId = 'admin-1';
        const overdueOrders = [
            { id: 'order-1', customer_id: 'c1', balance_due: 5000, credit_deadline: '2025-01-01', created_by: userId }
        ];

        const selectChain = createChain(overdueOrders);
        const updateChain = createChain({});
        const notificationChain = createChain({});

        mockFrom.mockImplementation((table: string) => {
            if (table === 'sales_orders') {
                const chain = createChain(overdueOrders);
                chain.select = jest.fn().mockReturnValue(chain);
                chain.update = jest.fn().mockReturnValue(updateChain);
                return chain;
            }
            if (table === 'notifications') {
                return notificationChain;
            }
            return createChain({});
        });

        const result = await service.checkAndUpdateOverdueOrders();

        expect(result.count).toBe(1);
        expect(updateChain.in).toHaveBeenCalledWith('id', ['order-1']);
        expect(notificationChain.insert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                user_id: userId,
                type: 'overdue_payment'
            })
        ]));
    });
});
