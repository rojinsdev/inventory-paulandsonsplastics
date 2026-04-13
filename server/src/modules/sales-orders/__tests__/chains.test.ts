// --- SmartMock Setup ---
const mockDB: { [table: string]: any[] } = {
    products: [],
    stock_balances: [],
    sales_orders: [],
    sales_order_items: [],
    production_requests: [],
    customers: [],
    customer_balances: [],
    raw_materials: [],
    purchases: [],
    cash_flow_logs: [],
    suppliers: [],
    production_logs: [],
    payments: [],
    machines: [],
    machine_products: [],
    product_templates: [],
    cap_stock_balances: [],
    inner_stock_balances: [],
    inventory_transactions: [],
    caps: [],
};

const mockLogAction = jest.fn().mockResolvedValue(null);
const mockSendToRole = jest.fn().mockResolvedValue(null);
const mockLogEntry = jest.fn().mockResolvedValue({ id: 'cf-1' });

// CRITICAL: jest.mock MUST be at the top level
jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: jest.fn(),
        rpc: jest.fn()
    }
}));

jest.mock('../../inventory/inventory.service', () => ({
    inventoryService: {
        logTransaction: jest.fn(),
        adjustRawMaterial: jest.fn(),
        adjustStock: jest.fn(),
        updateInventory: jest.fn()
    }
}));

const clearMockDB = () => {
    Object.keys(mockDB).forEach(key => {
        (mockDB as any)[key] = [];
    });
};

const setupMocks = () => {
    clearMockDB();
    const { supabase } = require('../../../config/supabase');
    const { inventoryService } = require('../../inventory/inventory.service');

    supabase.from.mockImplementation((table: string) => {
        const chain: any = {};
        chain._where = {};
        chain._in = null;
        chain._gt = null;
        
        chain.select = jest.fn(() => chain);
        chain.insert = jest.fn((data: any) => {
            const rows = Array.isArray(data) ? data : [data];
            if (!mockDB[table]) mockDB[table] = [];
            const rowsWithIds = rows.map(r => ({
                id: r.id || `${table.slice(0, 3)}-${Math.random().toString(36).substr(2, 9)}`,
                ...r
            }));
            mockDB[table].push(...rowsWithIds);
            return chain;
        });
        chain.eq = jest.fn((col, val) => {
            chain._where[col] = val;
            return chain;
        });
        chain.gt = jest.fn((col, val) => {
            chain._gt = { col, val };
            return chain;
        });
        chain.update = jest.fn((patch: any) => {
            const rows = mockDB[table] || [];
            rows.forEach(r => {
                let match = true;
                for (const [c, v] of Object.entries(chain._where)) {
                    if (r[c] !== v) match = false;
                }
                if (match) Object.assign(r, patch);
            });
            return chain;
        });
        chain.delete = jest.fn(() => chain);
        chain.or = jest.fn(() => chain);
        chain.in = jest.fn((col, vals) => {
            chain._in = { col, vals };
            return chain;
        });
        chain.neq = jest.fn(() => chain);
        chain.is = jest.fn(() => chain);
        
        const executeQuery = () => {
            let data = [...(mockDB[table] || [])];
            
            // Join support
            if (table === 'sales_order_items') {
                data = data.map(item => {
                    const product = (mockDB.products || []).find(p => p.id === item.product_id);
                    return { ...item, products: product };
                });
            }

            if (table === 'sales_orders') {
                data = data.map(order => {
                    const items = (mockDB.sales_order_items || []).filter(i => i.order_id === order.id);
                    const itemsWithProducts = items.map(item => {
                        const product = (mockDB.products || []).find(p => p.id === item.product_id);
                        return { ...item, products: product };
                    });
                    const customer = (mockDB.customers || []).find(c => c.id === order.customer_id);
                    return { ...order, sales_order_items: itemsWithProducts, customer };
                });
            }

            // EQ Filter
            for (const [col, val] of Object.entries(chain._where)) {
                data = data.filter((r: any) => {
                    const rVal = r[col];
                    // Handle null/undefined comparisons for cap_id
                    if (val === null) return rVal === null || rVal === undefined;
                    return rVal === val;
                });
            }
            if (chain._in) {
                const { col, vals } = chain._in;
                data = data.filter((r: any) => vals.includes(r[col]));
            }
            // GT Filter
            if (chain._gt) {
                const { col, val } = chain._gt;
                data = data.filter((r: any) => r[col] > val);
            }
            return data;
        };

        chain.maybeSingle = jest.fn(() => {
            const results = executeQuery();
            return Promise.resolve({ data: results[0] || null, error: null });
        });
        chain.single = jest.fn(() => {
            const results = executeQuery();
            const data = results[0] || null;
            return Promise.resolve({ data, error: null });
        });
        chain.order = jest.fn(() => Promise.resolve({ data: executeQuery(), error: null }));
        chain.limit = jest.fn(() => chain);
        chain.range = jest.fn(() => chain);
        chain.then = (resolve: any) => {
            resolve({ data: executeQuery(), error: null });
        };
        return chain;
    });

    supabase.rpc.mockImplementation((fnName: string, args: any) => {
        if (fnName === 'adjust_raw_material_stock') {
            const { p_material_id, p_weight_change } = args;
            const rm = mockDB.raw_materials.find(r => r.id === p_material_id);
            if (rm) {
                rm.stock_weight_kg += p_weight_change;
            }
            return Promise.resolve({ data: null, error: null });
        }
        if (fnName === 'adjust_stock') {
            const { p_product_id, p_factory_id, p_state, p_quantity_change, p_cap_id, p_unit_type, p_inner_id } = args;
            let balance = mockDB.stock_balances.find(b => 
                b.product_id === p_product_id && 
                b.state === p_state && 
                b.factory_id === p_factory_id &&
                (b.cap_id || null) === (p_cap_id || null) &&
                (b.unit_type || '') === (p_unit_type || '') &&
                (b.inner_id || null) === (p_inner_id || null)
            );
            if (!balance) {
                balance = {
                    product_id: p_product_id,
                    factory_id: p_factory_id,
                    state: p_state,
                    quantity: 0,
                    cap_id: p_cap_id || null,
                    unit_type: p_unit_type || '',
                    inner_id: p_inner_id || null
                };
                mockDB.stock_balances.push(balance);
            }
            balance.quantity += p_quantity_change;
            return Promise.resolve({ data: null, error: null });
        }
        if (fnName === 'adjust_stock_by_id') {
            const { p_id, p_quantity_change } = args;
            const balance = mockDB.stock_balances.find(b => b.id === p_id);
            if (balance) {
                balance.quantity += p_quantity_change;
            }
            return Promise.resolve({ data: null, error: null });
        }

        if (fnName === 'submit_production_atomic') {
            const { 
                p_product_id, p_total_produced, p_damaged_count, p_user_id, p_factory_id, 
                p_machine_id, p_date, p_shift_number, p_start_time, p_end_time 
            } = args;

            const product = mockDB.products.find(p => p.id === p_product_id);
            const actual_qty = p_total_produced - (p_damaged_count || 0);
            
            // 1. Log entry
            const logEntry = {
                id: `log-${Math.random().toString(36).substr(2, 9)}`,
                date: p_date,
                machine_id: p_machine_id,
                product_id: p_product_id,
                actual_quantity: actual_qty,
                total_produced: p_total_produced,
                damaged_count: p_damaged_count,
                user_id: p_user_id,
                factory_id: p_factory_id,
                status: 'submitted',
                created_at: new Date().toISOString()
            };
            mockDB.production_logs.push(logEntry);

            // 2. Product Stock
            let balance = mockDB.stock_balances.find(b => 
                b.product_id === p_product_id && b.state === 'packed' && b.factory_id === p_factory_id
            );
            if (balance) {
                balance.quantity += actual_qty;
            } else {
                mockDB.stock_balances.push({
                    product_id: p_product_id,
                    factory_id: p_factory_id,
                    state: 'packed',
                    quantity: actual_qty,
                    unit_type: ''
                });
            }

            // 3. Raw Material
            if (product && product.raw_material_id) {
                const rm = mockDB.raw_materials.find(r => r.id === product.raw_material_id);
                if (rm) {
                    const consumption = (actual_qty * (product.weight_grams || 0)) / 1000;
                    rm.stock_weight_kg -= consumption;
                }
            }

            return Promise.resolve({ data: logEntry.id, error: null });
        }

        if (fnName === 'create_order_atomic') {
            const { p_customer_id, p_delivery_date, p_notes, p_user_id, p_items, p_order_date } = args;

            const statesForAvailability = ['semi_finished', 'packed', 'finished'];

            for (const item of p_items) {
                if (item.quantity == null || item.quantity <= 0) {
                    return Promise.resolve({
                        data: null,
                        error: { message: 'Invalid quantity: Quantity must be positive.' },
                    });
                }
                if (!item.product_id && !item.cap_id) {
                    return Promise.resolve({
                        data: null,
                        error: { message: 'Invalid item: must have either product_id or cap_id' },
                    });
                }
                const ut = item.unit_type || 'bundle';
                if (item.product_id && ['packet', 'bundle'].includes(ut) && !item.cap_id) {
                    return Promise.resolve({
                        data: null,
                        error: {
                            message: `Cap selection is required for ${ut} orders. Please select a cap for the product.`,
                        },
                    });
                }
            }

            const orderId = `order-${Math.random().toString(36).substr(2, 9)}`;

            mockDB.sales_orders.push({
                id: orderId,
                customer_id: p_customer_id,
                delivery_date: p_delivery_date,
                notes: p_notes,
                created_by: p_user_id,
                status: 'pending',
                created_at: new Date().toISOString(),
                order_date: p_order_date,
            });

            for (const item of p_items) {
                const itemId = `item-${Math.random().toString(36).substr(2, 9)}`;
                const isCap = !!item.cap_id && !item.product_id;
                const unitType = item.unit_type || (isCap ? 'loose' : 'bundle');

                let factoryId = 'fact-1';
                let hasStock = false;
                let availableTotal = 0;

                if (isCap) {
                    const cap = (mockDB.caps || []).find((c: any) => c.id === item.cap_id);
                    factoryId = cap?.factory_id || factoryId;
                    const capStates = ['semi_finished', 'finished'];
                    const avail = (mockDB.cap_stock_balances || []).filter(
                        (b: any) =>
                            b.cap_id === item.cap_id &&
                            capStates.includes(b.state) &&
                            (b.factory_id === factoryId || b.factory_id == null) &&
                            (b.unit_type || 'loose') === (unitType || 'loose')
                    );
                    availableTotal = avail.reduce((s: number, b: any) => s + Number(b.quantity || 0), 0);
                    hasStock = availableTotal >= item.quantity;
                } else {
                    const product = mockDB.products.find((p: any) => p.id === item.product_id);
                    factoryId = product?.factory_id || factoryId;
                    const avail = (mockDB.stock_balances || []).filter(
                        (b: any) =>
                            b.product_id === item.product_id &&
                            statesForAvailability.includes(b.state) &&
                            (b.factory_id === factoryId || b.factory_id == null) &&
                            (b.unit_type || unitType) === unitType &&
                            (item.cap_id == null || (b.cap_id || null) === (item.cap_id || null))
                    );
                    availableTotal = avail.reduce((s: number, b: any) => s + Number(b.quantity || 0), 0);
                    hasStock = availableTotal >= item.quantity;
                }

                const isBackordered = !hasStock;

                mockDB.sales_order_items.push({
                    id: itemId,
                    order_id: orderId,
                    product_id: item.product_id || null,
                    cap_id: item.cap_id || null,
                    item_type: isCap ? 'cap' : 'product',
                    quantity: item.quantity,
                    quantity_reserved: 0,
                    quantity_prepared: 0,
                    quantity_shipped: 0,
                    unit_type: unitType,
                    is_backordered: isBackordered,
                    is_prepared: false,
                    include_inner: item.include_inner || false,
                    inner_id: item.inner_id || null,
                });

                // Mirrors create_order_atomic: one production_requests row per backordered line (shortfall only)
                if (isBackordered) {
                    const shortfall = Math.max(0, item.quantity - availableTotal);
                    if (isCap) {
                        mockDB.production_requests.push({
                            cap_id: item.cap_id,
                            factory_id: factoryId,
                            quantity: shortfall,
                            unit_type: unitType,
                            sales_order_id: orderId,
                            status: 'pending',
                            product_id: null,
                            inner_id: null,
                        });
                    } else {
                        mockDB.production_requests.push({
                            product_id: item.product_id,
                            cap_id: item.cap_id || null,
                            inner_id: item.inner_id || null,
                            factory_id: factoryId,
                            quantity: shortfall,
                            unit_type: unitType,
                            sales_order_id: orderId,
                            status: 'pending',
                        });
                    }
                }
            }

            return Promise.resolve({
                data: { success: true, order_id: orderId, total_amount: 0 },
                error: null,
            });
        }

        if (fnName === 'prepare_order_items_atomic') {
            const { p_order_id, p_items, p_user_id } = args;
            const order = mockDB.sales_orders.find((o: any) => o.id === p_order_id);
            if (!order) {
                return Promise.resolve({ data: null, error: { message: `Order not found: ${p_order_id}` } });
            }
            if (!['pending', 'reserved'].includes(order.status)) {
                return Promise.resolve({
                    data: null,
                    error: {
                        message: `Cannot prepare order in status: ${order.status}. Order must be pending or reserved.`,
                    },
                });
            }

            let totalReserved = 0;

            for (const item of p_items) {
                const itemId = item.item_id;
                const qty = item.quantity;
                if (qty == null || qty <= 0) {
                    return Promise.resolve({
                        data: null,
                        error: { message: 'Invalid quantity: Quantity must be positive.' },
                    });
                }

                const soi = mockDB.sales_order_items.find(
                    (i: any) => i.id === itemId && i.order_id === p_order_id
                );
                if (!soi) {
                    return Promise.resolve({
                        data: null,
                        error: { message: `Order item not found or does not belong to this order: ${itemId}` },
                    });
                }

                const factoryId = 'fact-1';
                const isCapOnly = !soi.product_id && !!soi.cap_id;

                if (isCapOnly) {
                    const capStates = ['semi_finished', 'finished'];
                    const available = (mockDB.cap_stock_balances || []).filter(
                        (b: any) =>
                            b.cap_id === soi.cap_id &&
                            capStates.includes(b.state) &&
                            (b.factory_id === factoryId || b.factory_id == null) &&
                            (b.unit_type || 'loose') === (soi.unit_type || 'loose')
                    );
                    const sumAvail = available.reduce((s: number, b: any) => s + Number(b.quantity || 0), 0);
                    if (sumAvail < qty) {
                        return Promise.resolve({
                            data: null,
                            error: {
                                message: `Insufficient cap stock for cap ${soi.cap_id}. Required: ${qty}, Available: ${sumAvail}`,
                            },
                        });
                    }
                    let remaining = qty;
                    for (const b of available.sort((a: any, c: any) => Number(c.quantity) - Number(a.quantity))) {
                        if (remaining <= 0) break;
                        const take = Math.min(remaining, Number(b.quantity));
                        b.quantity = Number(b.quantity) - take;
                        remaining -= take;
                    }
                    let reserved = mockDB.cap_stock_balances.find(
                        (b: any) =>
                            b.cap_id === soi.cap_id &&
                            b.state === 'reserved' &&
                            (b.unit_type || 'loose') === (soi.unit_type || 'loose')
                    );
                    if (reserved) {
                        reserved.quantity = Number(reserved.quantity) + qty;
                    } else {
                        mockDB.cap_stock_balances.push({
                            cap_id: soi.cap_id,
                            state: 'reserved',
                            quantity: qty,
                            factory_id: factoryId,
                            unit_type: soi.unit_type || 'loose',
                        });
                    }
                } else {
                    const stateMapping: Record<string, string> = {
                        loose: 'semi_finished',
                        packet: 'packed',
                        bundle: 'finished',
                    };
                    const sourceState = stateMapping[soi.unit_type || 'bundle'] || 'finished';
                    const available = (mockDB.stock_balances || []).filter(
                        (b: any) =>
                            b.product_id === soi.product_id &&
                            b.state === sourceState &&
                            (b.factory_id === factoryId || b.factory_id == null) &&
                            (b.unit_type || soi.unit_type) === (soi.unit_type || 'bundle') &&
                            (soi.cap_id == null || (b.cap_id || null) === (soi.cap_id || null))
                    );
                    const sumAvail = available.reduce((s: number, b: any) => s + Number(b.quantity || 0), 0);
                    if (sumAvail < qty) {
                        return Promise.resolve({
                            data: null,
                            error: {
                                message: `Insufficient physical stock for product ${soi.product_id}. Required: ${qty}, Available: ${sumAvail} in state ${sourceState}.`,
                            },
                        });
                    }
                    let remaining = qty;
                    for (const b of available.sort((a: any, c: any) => Number(c.quantity) - Number(a.quantity))) {
                        if (remaining <= 0) break;
                        const take = Math.min(remaining, Number(b.quantity));
                        b.quantity = Number(b.quantity) - take;
                        remaining -= take;
                    }
                    let reserved = mockDB.stock_balances.find(
                        (b: any) =>
                            b.product_id === soi.product_id &&
                            b.state === 'reserved' &&
                            (b.unit_type || soi.unit_type) === (soi.unit_type || 'bundle') &&
                            (soi.cap_id == null || (b.cap_id || null) === (soi.cap_id || null))
                    );
                    if (reserved) {
                        reserved.quantity = Number(reserved.quantity) + qty;
                    } else {
                        mockDB.stock_balances.push({
                            product_id: soi.product_id,
                            state: 'reserved',
                            quantity: qty,
                            factory_id: factoryId,
                            unit_type: soi.unit_type || 'bundle',
                            cap_id: soi.cap_id || null,
                            inner_id: soi.inner_id || null,
                        });
                    }
                }

                soi.quantity_prepared = (soi.quantity_prepared || 0) + qty;
                soi.quantity_reserved = (soi.quantity_reserved || 0) + qty;
                soi.is_prepared = soi.quantity_prepared >= soi.quantity;
                totalReserved += qty;
            }

            const allPrepared = mockDB.sales_order_items
                .filter((i: any) => i.order_id === p_order_id)
                .every((i: any) => i.is_prepared);
            if (allPrepared) {
                order.status = 'reserved';
            }

            return Promise.resolve({
                data: {
                    success: true,
                    order_id: p_order_id,
                    reserved_count: totalReserved,
                    message: `Successfully reserved ${totalReserved} items`,
                },
                error: null,
            });
        }

        if (fnName === 'process_partial_dispatch') {
            const {
                p_order_id,
                p_items,
                p_user_id,
                p_payment_mode,
                p_discount_type,
            } = args;
            const order = mockDB.sales_orders.find((o: any) => o.id === p_order_id);
            if (!order) {
                return Promise.resolve({ data: null, error: { message: `Order ${p_order_id} not found` } });
            }
            if (!['reserved', 'partially_delivered'].includes(order.status)) {
                return Promise.resolve({
                    data: null,
                    error: {
                        message: `Cannot dispatch order in status: ${order.status}. Order must be reserved or partially delivered.`,
                    },
                });
            }
            const payMode = p_payment_mode || 'cash';
            if (!['cash', 'credit'].includes(payMode)) {
                return Promise.resolve({
                    data: null,
                    error: { message: `Invalid payment mode: ${payMode}. Must be cash or credit.` },
                });
            }
            const discType = p_discount_type || 'fixed';
            if (!['percentage', 'fixed'].includes(discType)) {
                return Promise.resolve({
                    data: null,
                    error: { message: `Invalid discount type: ${discType}. Must be percentage or fixed.` },
                });
            }

            for (const item of p_items) {
                if (item.quantity == null || item.quantity <= 0) {
                    return Promise.resolve({
                        data: null,
                        error: { message: 'Invalid quantity: Quantity must be positive.' },
                    });
                }
                if (item.unit_price == null || item.unit_price < 0) {
                    return Promise.resolve({
                        data: null,
                        error: { message: 'Invalid unit price: Price must be non-negative.' },
                    });
                }

                const soi = mockDB.sales_order_items.find(
                    (i: any) => i.id === item.item_id && i.order_id === p_order_id
                );
                if (!soi) {
                    return Promise.resolve({
                        data: null,
                        error: {
                            message: `Order item ${item.item_id} not found or does not belong to order ${p_order_id}`,
                        },
                    });
                }

                const reservedQty = soi.quantity_reserved || 0;
                const shipped = soi.quantity_shipped || 0;
                const canShip = reservedQty - shipped;

                if (item.quantity > canShip) {
                    return Promise.resolve({
                        data: null,
                        error: {
                            message: `Cannot dispatch ${item.quantity} for item ${item.item_id}. Only ${canShip} available (reserved: ${reservedQty}, already shipped: ${shipped})`,
                        },
                    });
                }

                soi.quantity_shipped = shipped + item.quantity;

                const capOnly = !soi.product_id && !!soi.cap_id;
                if (capOnly) {
                    let remaining = item.quantity;
                    const reservedRows = (mockDB.cap_stock_balances || []).filter(
                        (b: any) =>
                            b.cap_id === soi.cap_id &&
                            b.state === 'reserved' &&
                            (b.unit_type || 'loose') === (soi.unit_type || 'loose')
                    );
                    const sumRes = reservedRows.reduce((s: number, b: any) => s + Number(b.quantity || 0), 0);
                    if (sumRes < item.quantity) {
                        return Promise.resolve({
                            data: null,
                            error: {
                                message: `Failed to deduct all reserved stock for item ${item.item_id}. Remaining: ${item.quantity}`,
                            },
                        });
                    }
                    for (const b of reservedRows.sort((a: any, c: any) => Number(c.quantity) - Number(a.quantity))) {
                        if (remaining <= 0) break;
                        const take = Math.min(remaining, Number(b.quantity));
                        b.quantity = Number(b.quantity) - take;
                        remaining -= take;
                    }
                } else {
                    let remaining = item.quantity;
                    const reservedRows = (mockDB.stock_balances || []).filter(
                        (b: any) =>
                            b.product_id === soi.product_id &&
                            b.state === 'reserved' &&
                            (b.unit_type || soi.unit_type) === (soi.unit_type || 'bundle') &&
                            (soi.cap_id == null || (b.cap_id || null) === (soi.cap_id || null))
                    );
                    const sumRes = reservedRows.reduce((s: number, b: any) => s + Number(b.quantity || 0), 0);
                    if (sumRes < item.quantity) {
                        return Promise.resolve({
                            data: null,
                            error: {
                                message: `Failed to deduct all reserved stock for item ${item.item_id}. Remaining: ${item.quantity}`,
                            },
                        });
                    }
                    for (const b of reservedRows.sort((a: any, c: any) => Number(c.quantity) - Number(a.quantity))) {
                        if (remaining <= 0) break;
                        const take = Math.min(remaining, Number(b.quantity));
                        b.quantity = Number(b.quantity) - take;
                        remaining -= take;
                    }
                }
            }

            const allDone = mockDB.sales_order_items
                .filter((i: any) => i.order_id === p_order_id)
                .every((i: any) => (i.quantity_shipped || 0) >= i.quantity);
            order.status = allDone ? 'delivered' : 'partially_delivered';

            const batchId = `batch-${Math.random().toString(36).substr(2, 9)}`;
            return Promise.resolve({
                data: {
                    success: true,
                    dispatch_id: batchId,
                    payment_id: null,
                    message: 'Dispatch processed successfully',
                },
                error: null,
            });
        }

        return Promise.resolve({ data: null, error: null });
    });

    inventoryService.adjustRawMaterial.mockImplementation((id: string, data: any) => {
        if (mockDB.raw_materials) {
            const rm = mockDB.raw_materials.find(r => r.id === id);
            if (rm) {
                rm.stock_weight_kg = (rm.stock_weight_kg || 0) + data.quantity;
            }
        }
        return Promise.resolve(null);
    });
    inventoryService.logTransaction.mockResolvedValue(null);
    inventoryService.adjustStock.mockResolvedValue(null);
    inventoryService.updateInventory.mockResolvedValue(null);
};

jest.mock('../../audit/audit.service', () => ({
    AuditService: jest.fn().mockImplementation(() => ({
        logAction: mockLogAction
    }))
}));
jest.mock('../../notifications/push-notification.service', () => ({
    pushNotificationService: {
        sendToRole: mockSendToRole,
        sendToUser: jest.fn().mockResolvedValue(null)
    }
}));
jest.mock('../../cash-flow/cash-flow.service', () => ({
    cashFlowService: {
        getCategoryId: jest.fn().mockResolvedValue('cat-1'),
        logEntry: mockLogEntry
    }
}));
jest.mock('../../settings/settings.service', () => ({
    SettingsService: {
        getValue: jest.fn().mockResolvedValue(100)
    }
}));

// Import services AFTER mocks
const { SalesOrderService } = require('../sales-order.service');
const { PurchaseService } = require('../../purchases/purchase.service');
const { ProductionService } = require('../../production/production.service');
const { eventBus } = require('../../../core/eventBus');
const { initEventHandlers } = require('../../events/index');

// Helper to wait for event handlers
const waitForEvents = () => new Promise(resolve => setImmediate(resolve));

describe('Business Chain Integration Tests', () => {
    let salesService: any;
    let purchaseService: any;
    let prodService: any;

    beforeEach(() => {
        setupMocks();
        
        // Reset DB
        Object.keys(mockDB).forEach(key => mockDB[key] = []);
        
        // Reset Event Bus and Register Handlers
        eventBus.removeAllListeners();
        initEventHandlers();
        
        salesService = new SalesOrderService();
        purchaseService = new PurchaseService();
        prodService = new ProductionService();
        
        jest.clearAllMocks();
    });

    it('should create a production request when a backordered item is ordered', async () => {
        // Seed: Product and 0 loose (semi_finished) stock — packet/bundle would require cap_id in real RPC
        mockDB.products = [{ id: 'prod-1', name: 'Test Product', selling_price: 100, factory_id: 'fact-1' }];
        mockDB.stock_balances = [];

        const orderData = {
            customer_id: 'cust-1',
            items: [
                {
                    product_id: 'prod-1',
                    quantity: 10,
                    unit_price: 100,
                    unit_type: 'loose' as const,
                },
            ],
            user_id: 'user-1',
        };

        // Execute
        const result = await salesService.createOrder(orderData);
        await waitForEvents();

        // Verify: Order creation success
        expect(result).toBeDefined();
        expect(mockDB.sales_orders.length).toBe(1);

        // Verify: THE CHAIN - Production Request created
        expect(mockDB.production_requests.length).toBe(1);
        expect(mockDB.production_requests[0].product_id).toBe('prod-1');
        
        // Verify: SIDE EFFECTS (Audit & Notification)
        expect(mockLogAction).toHaveBeenCalledWith(
            expect.any(String),
            'CREATE',
            'sales_order',
            expect.any(String),
            expect.any(Object)
        );
        expect(mockSendToRole).toHaveBeenCalled();
        
    });

    it('Chain 1: Procurement -> Raw Material Stock -> Cash Flow', async () => {

        // Seed
        mockDB.suppliers = [{ id: 'sup-1', name: 'Raw Material Supplier', balance_due: 0 }];
        mockDB.raw_materials = [{ id: 'rw-1', name: 'PVC Resin', stock_weight_kg: 100 }];

        const purchaseData = {
            supplier_id: 'sup-1',
            factory_id: 'fac-1',
            item_type: 'Raw Material' as const,
            raw_material_id: 'rw-1',
            quantity: 50,
            unit: 'kg',
            total_amount: 5000,
            paid_amount: 2000,
            balance_due: 3000,
            created_by: 'user-1'
        };

        // Execute
        await purchaseService.createPurchase(purchaseData);
        await waitForEvents();

        // Verify: Purchase record
        expect(mockDB.purchases.length).toBe(1);
        
        // Verify: Supplier balance updated
        expect(mockDB.suppliers[0].balance_due).toBe(3000);

        // Verify: SIDE EFFECTS (Finance)
        expect(mockLogEntry).toHaveBeenCalled();
        
    });

    it('Chain 2: Production -> Raw Material Consumption -> Stock Update', async () => {

        // Seed
        mockDB.machines = [{ id: 'mac-1', factory_id: 'fac-1', status: 'active', daily_running_cost: 1000 }];
        mockDB.products = [{ 
            id: 'prod-1', 
            name: 'Bucket', 
            weight_grams: 500, 
            status: 'active', 
            counting_method: 'unit_count', 
            raw_material_id: 'rw-1',
            template_id: 'tpl-1'
        }];
        mockDB.product_templates = [{ id: 'tpl-1' }];
        mockDB.machine_products = [{ machine_id: 'mac-1', product_template_id: 'tpl-1', ideal_cycle_time_seconds: 30 }];
        mockDB.raw_materials = [{ id: 'rw-1', name: 'Plastic', stock_weight_kg: 100, factory_id: 'fac-1' }];

        const productionData = {
            machine_id: 'mac-1',
            product_id: 'prod-1',
            shift_number: 1 as const,
            start_time: '08:00',
            end_time: '08:15', // 15 mins total
            total_produced: 20, // 20 * 30s = 10 mins. 5 mins downtime.
            damaged_count: 0,
            user_id: 'user-1'
        };

        // Execute
        await prodService.submitProduction(productionData);
        await waitForEvents();

        // Verify: Production Log
        expect(mockDB.production_logs.length).toBe(1);
        expect(mockDB.production_logs[0].actual_quantity).toBe(20);

        // Verify: SIDE EFFECTS (Audit)
        expect(mockLogAction).toHaveBeenCalledWith(
            expect.any(String),
            'SUBMIT_PRODUCTION',
            'production_log',
            expect.any(String),
            expect.any(Object)
        );

        // Verify: Raw material consumption (500g * 20 = 10kg)
        // The service updates raw_materials weight
        expect(mockDB.raw_materials[0].stock_weight_kg).toBe(90); // 100 - 10

    });

    test('Chain 4: Sales Order -> Fulfillment (Preparation/Reservation)', async () => {
        setupMocks();
        const { salesOrderService } = require('../sales-order.service');

        // 1. Seed customer and product
        mockDB.customers = [{ id: 'cust-1', name: 'Standard Corp' }];
        mockDB.caps = [{ id: 'cap-a', name: 'Cap A', factory_id: 'fact-1' }];
        mockDB.products = [{ 
            id: 'prod-1', 
            name: 'Product A', 
            size: '500ml', 
            color: 'Blue', 
            selling_price: 10, 
            factory_id: 'fact-1',
            items_per_bundle: 100 
        }];
        
        // 2. Seed stock (Finished, tub+cap combination)
        mockDB.stock_balances = [{
            id: 'bal-1',
            product_id: 'prod-1',
            factory_id: 'fact-1',
            state: 'finished',
            quantity: 100,
            unit_type: 'bundle',
            cap_id: 'cap-a',
            inner_id: null
        }];

        // 3. Create Sales Order (Manual Preparation Flow)
        const order = await salesOrderService.createOrder({
            customer_id: 'cust-1',
            items: [{ product_id: 'prod-1', cap_id: 'cap-a', quantity: 20, unit_type: 'bundle', unit_price: 10 }],
            user_id: 'user-1'
        });

        const item = order.sales_order_items[0];
        expect(order.status).toBe('pending');
        expect(item.quantity_reserved).toBe(0); // Should NOT be reserved yet
        expect(item.is_backordered).toBe(false);

        // 4. PM prepares the items (This moves stock from finished to reserved)
        try {
            await salesOrderService.prepareOrderItems(order.id, [{ itemId: item.id, quantity: 20 }], 'user-1');
            await waitForEvents();
        } catch (e: any) {
            throw e;
        }

        // 5. Verify Reservation
        const updatedOrder = await salesOrderService.getOrderById(order.id);
        expect(updatedOrder.status).toBe('reserved');
        expect(updatedOrder.sales_order_items[0].quantity_reserved).toBe(20);

        // 6. Verify Stock Movement
        const finishedStock = mockDB.stock_balances.find(
            (b: any) => b.state === 'finished' && b.product_id === 'prod-1' && b.cap_id === 'cap-a'
        );
        const reservedStock = mockDB.stock_balances.find(
            (b: any) => b.state === 'reserved' && b.product_id === 'prod-1' && b.cap_id === 'cap-a'
        );

        expect(finishedStock.quantity).toBe(80); // 100 - 20
        expect(reservedStock.quantity).toBe(20);
    });

    test('Chain 5: Fulfillment -> Dispatch (Delivery)', async () => {
        setupMocks();
        const { salesOrderService } = require('../sales-order.service');

        // 1. Seed Order (Reserved)
        mockDB.sales_orders = [{ id: 'sal-1', customer_id: 'cust-1', status: 'reserved' }];
        mockDB.sales_order_items = [{
            id: 'item-1',
            order_id: 'sal-1',
            product_id: 'prod-1',
            quantity: 20,
            quantity_reserved: 20,
            unit_type: 'bundle'
        }];
        mockDB.products = [{ id: 'prod-1', name: 'Product A', factory_id: 'fact-1' }];
        
        // 2. Seed Stock (Reserved)
        // Note: The service uses deliverStock which fetches balances and calls adjust_stock
        mockDB.stock_balances = [{
            id: 'bal-res-1',
            product_id: 'prod-1',
            factory_id: 'fact-1',
            state: 'reserved',
            quantity: 20,
            unit_type: 'bundle',
            cap_id: null,
        }];

        // 3. Perform Delivery
        await salesOrderService.updateOrderStatus('sal-1', 'delivered', 'user-1');
        await waitForEvents();

        // 4. Verify Stock Deduction
        const reservedStock = mockDB.stock_balances.find(b => b.state === 'reserved' && b.product_id === 'prod-1');
        expect(reservedStock.quantity).toBe(0);

        // 5. Verify Order Status & Side Effects (Audit)
        const updatedOrder = await salesOrderService.getOrderById('sal-1');
        expect(updatedOrder.status).toBe('delivered');
        
        expect(mockLogAction).toHaveBeenCalledWith(
            expect.any(String),
            'UPDATE_STATUS',
            'sales_order',
            'sal-1',
            expect.objectContaining({ new_status: 'delivered' })
        );

    });

    test('Chain 6: Customer Payment -> Balance Update', async () => {
        setupMocks();
        const { salesOrderService } = require('../sales-order.service');

        // 1. Seed Order (Delivered)
        // Note: total_amount/balance_due are set manually here to simulate DB state
        mockDB.sales_orders = [{ 
            id: 'sal-1', 
            customer_id: 'cust-1', 
            status: 'delivered',
            total_amount: 200,
            amount_paid: 0,
            balance_due: 200,
            created_by: 'user-1'
        }];
        mockDB.customers = [{ id: 'cust-1', name: 'Main Corp' }];
        
        // 2. Perform Payment
        await salesOrderService.recordPayment('sal-1', {
            amount: 50,
            payment_method: 'cash',
            notes: 'First installment',
            user_id: 'user-1'
        });
        await waitForEvents();

        // 3. Verify Order Balances
        const updatedOrder = await salesOrderService.getOrderById('sal-1');
        expect(updatedOrder.amount_paid).toBe(50);
        expect(updatedOrder.balance_due).toBe(150);

        // 4. Verify Payment Record & Side Effects (Finance)
        expect(mockDB.payments.length).toBe(1);
        expect(mockLogEntry).toHaveBeenCalled();

    });

    test('Chain 7: Production Request -> Mark as Prepared (Manual Flow)', async () => {
        setupMocks();
        const { productionService } = require('../../production/production.service');

        // 1. Seed Production Request (Loose units require semi_finished stock)
        mockDB.production_requests = [{
            id: 'req-1',
            product_id: 'prod-1',
            quantity: 100,
            unit_type: 'loose', // Important for state mapping
            status: 'pending',
            factory_id: 'fact-1'
        }];
        mockDB.products = [{ id: 'prod-1', name: 'Product A' }];
        
        // 2. Seed matching stock to pass validation in fulfillRequestManually
        mockDB.stock_balances = [{
            id: 'bal-1',
            product_id: 'prod-1',
            factory_id: 'fact-1',
            state: 'semi_finished', // Mapped from 'loose'
            quantity: 100,
            unit_type: ''
        }];

        // 3. Mark as Prepared
        await productionService.updateProductionRequestStatus('req-1', 'prepared', 'user-1');
        await waitForEvents();

        // 4. Verify Status Change & Side Effects (Audit)
        const req = mockDB.production_requests.find(r => r.id === 'req-1');
        expect(req.status).toBe('prepared');
        
        expect(mockLogAction).toHaveBeenCalledWith(
            expect.any(String),
            'UPDATE_STATUS',
            'production_requests',
            'req-1',
            { status: 'prepared' }
        );

    });

    test('Chain 8: Standalone Cap Fulfillment', async () => {
        setupMocks();
        const { salesOrderService } = require('../sales-order.service');
        const { productionService } = require('../../production/production.service');

        // 1. Setup Cap & initial stock
        const capId = 'cap-1';
        mockDB.caps = [{ id: capId, name: 'Red Cap', factory_id: 'fact-1' }];
        mockDB.cap_stock_balances = [{ cap_id: capId, state: 'packed', quantity: 0, factory_id: 'fact-1', unit_type: 'packet' }];
        
        // 2. Create Order for 100 caps (Expected: Backordered)
        const orderRes = await salesOrderService.createOrder({
            customer_id: 'cust-1',
            delivery_date: '2026-05-01',
            user_id: 'user-1',
            items: [{ cap_id: capId, quantity: 100, unit_type: 'packet' }]
        });
        const orderId = orderRes.id;
        
        const soi = mockDB.sales_order_items.find(i => i.order_id === orderId);
        expect(soi).toBeDefined();
        expect(soi?.is_backordered).toBe(true);
        expect(mockDB.production_requests.length).toBe(1);
        
        // 3. Mark as Prepared in Production screen (status only)
        // In reality, marking as prepared would add finished/packed stock - we simulate it here by adding stock first
        let capBalance = mockDB.cap_stock_balances.find(b => b.cap_id === capId && b.state === 'finished');
        if (capBalance) {
            capBalance.quantity = 100;
        } else {
            mockDB.cap_stock_balances.push({ 
                cap_id: capId, 
                state: 'finished', 
                quantity: 100, 
                factory_id: 'fact-1',
                unit_type: 'packet' 
            });
        }
        
        const req = mockDB.production_requests[0];
        await productionService.updateProductionRequestStatus(req.id, 'prepared', 'user-1');
        expect(req.status).toBe('prepared');
        
        // 4. Reserve stock manually in Order Prep screen
        await salesOrderService.prepareOrderItems(orderId, [{ itemId: soi!.id, quantity: 100 }], 'user-1');
        
        const updatedSoi = mockDB.sales_order_items.find(i => i.id === soi!.id);
        expect(updatedSoi?.quantity_reserved).toBe(100);
        expect(updatedSoi?.is_prepared).toBe(true);
        
        // 5. Dispatch
        const batchId = await salesOrderService.processDelivery(orderId, {
            items: [{ item_id: soi!.id, quantity: 100, unit_price: 10 }],
            payment_mode: 'cash',
            user_id: 'user-1'
        });
        expect(batchId).toBeDefined();
        
        const deliveredOrder = mockDB.sales_orders.find(o => o.id === orderId);
        expect(deliveredOrder?.status).toBe('delivered');

    });

    test('Chain 9: Dispatch blocked when nothing reserved (reserved qty = 0)', async () => {
        setupMocks();
        const { salesOrderService } = require('../sales-order.service');

        const orderId = `order-blocked`;
        const itemId = `item-blocked`;
        // Order is "reserved" in workflow sense is wrong here — line has zero reserved stock
        mockDB.sales_orders.push({ id: orderId, status: 'reserved', customer_id: 'c-1' });
        mockDB.sales_order_items.push({
            id: itemId,
            order_id: orderId,
            product_id: 'p-1',
            quantity: 50,
            quantity_reserved: 0,
            quantity_shipped: 0,
            unit_type: 'bundle',
        });

        await expect(
            salesOrderService.processDelivery(orderId, {
                items: [{ item_id: itemId, quantity: 50, unit_price: 100 }],
                payment_mode: 'cash',
                user_id: 'u-1',
            })
        ).rejects.toThrow(/Only 0 available|reserved/i);
    });

    describe('Sales chain edge cases (RPC-aligned mocks)', () => {
        it('rejects createOrder when packet line has product but no cap_id', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.products = [{ id: 'p1', factory_id: 'fact-1', selling_price: 1 }];
            mockDB.stock_balances = [];

            await expect(
                salesOrderService.createOrder({
                    customer_id: 'c1',
                    items: [{ product_id: 'p1', quantity: 1, unit_type: 'packet' }],
                    user_id: 'u1',
                })
            ).rejects.toThrow(/Cap selection is required/i);
        });

        it('rejects createOrder when bundle line has product but no cap_id', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.products = [{ id: 'p1', factory_id: 'fact-1', selling_price: 1 }];

            await expect(
                salesOrderService.createOrder({
                    customer_id: 'c1',
                    items: [{ product_id: 'p1', quantity: 1, unit_type: 'bundle' }],
                    user_id: 'u1',
                })
            ).rejects.toThrow(/Cap selection is required/i);
        });

        it('allows createOrder for loose tub without cap_id', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.products = [{ id: 'p1', factory_id: 'fact-1', selling_price: 1 }];
            mockDB.stock_balances = [
                {
                    product_id: 'p1',
                    factory_id: 'fact-1',
                    state: 'semi_finished',
                    quantity: 50,
                    unit_type: 'loose',
                    cap_id: null,
                },
            ];

            const order = await salesOrderService.createOrder({
                customer_id: 'c1',
                items: [{ product_id: 'p1', quantity: 5, unit_type: 'loose', unit_price: 1 }],
                user_id: 'u1',
            });
            expect(order.sales_order_items[0].is_backordered).toBe(false);
        });

        it('rejects createOrder when quantity is zero', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.products = [{ id: 'p1', factory_id: 'fact-1', selling_price: 1 }];

            await expect(
                salesOrderService.createOrder({
                    customer_id: 'c1',
                    items: [{ product_id: 'p1', cap_id: 'cap-z', quantity: 0, unit_type: 'bundle' }],
                    user_id: 'u1',
                })
            ).rejects.toThrow(/Invalid quantity/i);
        });

        it('prepareOrderItems fails when order status is delivered', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.sales_orders = [{ id: 'o1', customer_id: 'c1', status: 'delivered' }];
            mockDB.sales_order_items = [
                {
                    id: 'i1',
                    order_id: 'o1',
                    product_id: 'p1',
                    cap_id: 'cap1',
                    quantity: 1,
                    unit_type: 'bundle',
                },
            ];

            await expect(
                salesOrderService.prepareOrderItems('o1', [{ itemId: 'i1', quantity: 1 }], 'u1')
            ).rejects.toThrow(/Cannot prepare order in status/i);
        });

        it('prepareOrderItems fails when not enough physical stock for tub+cap', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.sales_orders = [{ id: 'o1', customer_id: 'c1', status: 'pending' }];
            mockDB.sales_order_items = [
                {
                    id: 'i1',
                    order_id: 'o1',
                    product_id: 'p1',
                    cap_id: 'cap1',
                    quantity: 100,
                    unit_type: 'bundle',
                },
            ];
            mockDB.stock_balances = [
                {
                    product_id: 'p1',
                    factory_id: 'fact-1',
                    state: 'finished',
                    quantity: 5,
                    unit_type: 'bundle',
                    cap_id: 'cap1',
                },
            ];

            await expect(
                salesOrderService.prepareOrderItems('o1', [{ itemId: 'i1', quantity: 100 }], 'u1')
            ).rejects.toThrow(/Insufficient physical stock/i);
        });

        it('processDelivery fails when payment_mode is invalid', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.sales_orders = [{ id: 'o1', customer_id: 'c1', status: 'reserved' }];
            mockDB.sales_order_items = [
                {
                    id: 'i1',
                    order_id: 'o1',
                    product_id: 'p1',
                    quantity: 10,
                    quantity_reserved: 10,
                    quantity_shipped: 0,
                    unit_type: 'bundle',
                    cap_id: null,
                },
            ];
            mockDB.stock_balances = [
                {
                    product_id: 'p1',
                    state: 'reserved',
                    quantity: 10,
                    unit_type: 'bundle',
                    cap_id: null,
                    factory_id: 'fact-1',
                },
            ];

            await expect(
                salesOrderService.processDelivery('o1', {
                    items: [{ item_id: 'i1', quantity: 10, unit_price: 1 }],
                    payment_mode: 'crypto' as any,
                    user_id: 'u1',
                })
            ).rejects.toThrow(/Invalid payment mode/i);
        });

        it('partial dispatch sets order to partially_delivered then delivered when completed', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.sales_orders = [{ id: 'o1', customer_id: 'c1', status: 'reserved' }];
            mockDB.sales_order_items = [
                {
                    id: 'i1',
                    order_id: 'o1',
                    product_id: 'p1',
                    quantity: 10,
                    quantity_reserved: 10,
                    quantity_shipped: 0,
                    unit_type: 'bundle',
                    cap_id: null,
                },
            ];
            mockDB.stock_balances = [
                {
                    product_id: 'p1',
                    state: 'reserved',
                    quantity: 10,
                    unit_type: 'bundle',
                    cap_id: null,
                    factory_id: 'fact-1',
                },
            ];

            await salesOrderService.processDelivery('o1', {
                items: [{ item_id: 'i1', quantity: 4, unit_price: 10 }],
                payment_mode: 'cash',
                user_id: 'u1',
            });
            let o = mockDB.sales_orders.find((x: any) => x.id === 'o1');
            expect(o.status).toBe('partially_delivered');

            await salesOrderService.processDelivery('o1', {
                items: [{ item_id: 'i1', quantity: 6, unit_price: 10 }],
                payment_mode: 'cash',
                user_id: 'u1',
            });
            o = mockDB.sales_orders.find((x: any) => x.id === 'o1');
            expect(o.status).toBe('delivered');
        });

        it('cap-only order with enough finished stock is not backordered', async () => {
            setupMocks();
            const { salesOrderService } = require('../sales-order.service');
            mockDB.caps = [{ id: 'cap-x', factory_id: 'fact-1' }];
            mockDB.cap_stock_balances = [
                { cap_id: 'cap-x', state: 'finished', quantity: 200, factory_id: 'fact-1', unit_type: 'loose' },
            ];

            const order = await salesOrderService.createOrder({
                customer_id: 'c1',
                items: [{ cap_id: 'cap-x', quantity: 50, unit_type: 'loose' }],
                user_id: 'u1',
            });
            const soi = order.sales_order_items[0];
            expect(soi.is_backordered).toBe(false);
        });
    });
});

