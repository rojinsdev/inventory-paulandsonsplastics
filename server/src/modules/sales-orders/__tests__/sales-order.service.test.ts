import { SalesOrderService } from '../sales-order.service';
import { supabase } from '../../../config/supabase';
import { inventoryService } from '../../inventory/inventory.service';
import { cashFlowService } from '../../cash-flow/cash-flow.service';

// Mock Dependencies
jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: jest.fn()
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

describe('SalesOrderService', () => {
    let service: SalesOrderService;
    let mockFrom: any;

    const createChain = (data: any, error: any = null) => {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.gt = jest.fn().mockReturnValue(chain);
        chain.lt = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.single = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] : data, error });
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] : (data === null ? null : data), error });
        chain.update = jest.fn().mockReturnValue(chain);
        chain.insert = jest.fn().mockReturnValue(chain);
        chain.delete = jest.fn().mockReturnValue(chain);
        chain.upsert = jest.fn().mockResolvedValue({ error });
        chain.or = jest.fn().mockReturnValue(chain);
        chain.then = (resolve: any) => resolve({ data, error });
        return chain;
    };

    beforeEach(() => {
        service = new SalesOrderService();
        jest.clearAllMocks();
        mockFrom = supabase.from;
    });

    it('should calculate totals and discounts correctly during delivery', async () => {
        // Setup Data
        const orderId = 'order-1';
        const mockOrder = {
            id: orderId,
            status: 'reserved',
            customer_id: 'cust-1',
            sales_order_items: [
                { id: 'item-1', product_id: 'prod-1', quantity: 10, unit_type: 'bundle', is_backordered: false, products: { factory_id: 'fac-1' } },
                { id: 'item-2', product_id: 'prod-2', quantity: 5, unit_type: 'bundle', is_backordered: false, products: { factory_id: 'fac-1' } }
            ]
        };

        const deliveryData = {
            items: [
                { item_id: 'item-1', quantity: 10, unit_price: 100 }, // 10 * 100 = 1000
                { item_id: 'item-2', quantity: 5, unit_price: 200 }  // 5 * 200 = 1000
            ],
            discount_type: 'percentage' as const,
            discount_value: 10, // 10% of 2000 = 200
            payment_mode: 'cash' as const,
            initial_payment: 500,
            user_id: 'user-admin'
        };

        // Expected Calculations:
        // Subtotal: 2000
        // Discount: 200 (10%)
        // Total: 1800
        // Paid: 500
        // Balance: 1300

        const updateSpy = jest.fn().mockReturnValue(createChain({}));

        mockFrom.mockImplementation((table: string) => {
            if (table === 'sales_orders') {
                const chain = createChain(mockOrder);
                chain.update = jest.fn().mockImplementation((updates) => {
                    updateSpy(updates);
                    return chain;
                });
                return chain;
            }
            if (table === 'sales_order_items') return createChain({});
            if (table === 'payments') return createChain({});
            if (table === 'stock_balances') return createChain({ quantity: 50 });
            return createChain({});
        });

        (cashFlowService.getCategoryId as jest.Mock).mockResolvedValue('cat-1');

        // Execute
        await service.processDelivery(orderId, deliveryData);

        // Verify Calculations
        expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
            subtotal: 2000,
            total_amount: 1800,
            amount_paid: 500,
            balance_due: 1300,
            status: 'delivered'
        }));

        expect(cashFlowService.logEntry).toHaveBeenCalledWith(expect.objectContaining({
            amount: 500,
            is_automatic: true
        }));
    });

    describe('getPendingPayments', () => {
        it('should filter by pending status (balance_due > 0)', async () => {
            const mockQuery = createChain([]);
            mockFrom.mockReturnValue(mockQuery);

            await service.getPendingPayments({ status: 'pending' });

            expect(mockQuery.or).toHaveBeenCalledWith('balance_due.gt.0,balance_due.is.null');
        });

        it('should filter by paid status (balance_due = 0)', async () => {
            const mockQuery = createChain([]);
            mockFrom.mockReturnValue(mockQuery);

            await service.getPendingPayments({ status: 'paid' });

            expect(mockQuery.eq).toHaveBeenCalledWith('balance_due', 0);
        });

        it('should return null if order is not found', async () => {
            const mockQuery = createChain(null);
            mockFrom.mockReturnValue(mockQuery);

            const result = await service.getOrderById('non-existent');

            expect(result).toBeNull();
        });
        it('should filter by overdue status', async () => {
            const mockQuery = createChain([]);
            mockFrom.mockReturnValue(mockQuery);

            await service.getPendingPayments({ status: 'overdue' });

            expect(mockQuery.eq).toHaveBeenCalledWith('is_overdue', true);
        });

        it('should not apply balance filter when status is all', async () => {
            const mockQuery = createChain([]);
            mockFrom.mockReturnValue(mockQuery);

            await service.getPendingPayments({ status: 'all' });

            expect(mockQuery.eq).not.toHaveBeenCalledWith('balance_due', 0);
            expect(mockQuery.gt).not.toHaveBeenCalledWith('balance_due', 0);
        });

        it('should filter by customer_id if provided', async () => {
            const mockQuery = createChain([]);
            mockFrom.mockReturnValue(mockQuery);

            await service.getPendingPayments({ customer_id: 'cust-1' });

            expect(mockQuery.eq).toHaveBeenCalledWith('customer_id', 'cust-1');
        });
    });
});
