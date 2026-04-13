/**
 * Defines all system event names as a constant enum.
 */
export enum SystemEvents {
    // Sales Module
    SALES_ORDER_CREATED = 'sales_order.created',
    SALES_ORDER_UPDATED = 'sales_order.updated',
    SALES_ORDER_STATUS_CHANGED = 'sales_order.status_changed',
    SALES_ORDER_ITEMS_PREPARED = 'sales_order.items_prepared',
    SALES_PAYMENT_RECORDED = 'sales_order.payment_recorded',
    /** After process_partial_dispatch RPC (all payment modes, including credit-only). */
    SALES_DISPATCH_BATCH_RECORDED = 'sales_order.dispatch_batch_recorded',
    SALES_ORDER_STATUS_UPDATED = 'sales.order_status_updated',

    // Production Module
    PRODUCTION_SUBMITTED = 'production.submitted',
    CAP_PRODUCTION_SUBMITTED = 'production.cap_submitted',
    INNER_PRODUCTION_SUBMITTED = 'production.inner_submitted',
    PRODUCTION_REQUEST_CREATED = 'production.request_created',
    PRODUCTION_REQUEST_PREPARED = 'production.request_prepared',
    PRODUCTION_REQUEST_STATUS_UPDATED = 'production.request_status_updated',

    // Purchase Module
    PURCHASE_CREATED = 'purchase.created',
    PURCHASE_PAYMENT_RECORDED = 'purchase.payment_recorded',

    /** Emitted after each cash_flow_logs row (or batch for shared categories). */
    CASH_FLOW_LOGGED = 'cash_flow.logged',

    // Inventory Module
    STOCK_ADJUSTED = 'inventory.stock_adjusted',
    STOCK_LOW_ALERT = 'inventory.stock_low',
}

/**
 * Type definitions for event payloads to ensure type safety across the bus.
 */
export interface EventPayloads {
    [SystemEvents.SALES_ORDER_CREATED]: {
        order_id: string;
        customer_id: string;
        userId: string;
        total_amount: number;
        items: any[];
        delivery_date?: string;
    };

    [SystemEvents.SALES_ORDER_UPDATED]: {
        order_id: string;
        userId: string;
        changes: any;
    };

    [SystemEvents.SALES_ORDER_STATUS_CHANGED]: {
        order_id: string;
        userId: string;
        previous_status: string;
        new_status: string;
    };

    [SystemEvents.SALES_ORDER_ITEMS_PREPARED]: {
        order_id: string;
        userId: string;
        items: any[];
    };

    [SystemEvents.SALES_ORDER_STATUS_UPDATED]: {
        order_id: string;
        old_status: string;
        new_status: string;
        userId: string;
    };

    [SystemEvents.PRODUCTION_SUBMITTED]: {
        production_id: string;
        machine_id: string;
        product_id: string;
        quantity: number;
        userId: string;
        factory_id: string;
    };

    [SystemEvents.CAP_PRODUCTION_SUBMITTED]: {
        production_id: string;
        cap_id: string;
        quantity: number;
        userId: string;
        factory_id: string;
    };

    [SystemEvents.INNER_PRODUCTION_SUBMITTED]: {
        production_id: string;
        inner_id: string;
        quantity: number;
        userId: string;
        factory_id: string;
    };

    [SystemEvents.PRODUCTION_REQUEST_CREATED]: {
        request_id: string;
        product_id: string;
        order_id: string;
        factory_id: string;
        quantity: number;
        unit_type: string;
    };

    [SystemEvents.PRODUCTION_REQUEST_PREPARED]: {
        request_id: string;
        userId: string;
    };

    [SystemEvents.PRODUCTION_REQUEST_STATUS_UPDATED]: {
        request_id: string;
        userId: string;
        status: string;
    };

    [SystemEvents.PRODUCTION_REQUEST_CREATED]: {
        request_id: string;
        product_id: string;
        order_id: string;
        factory_id: string;
        quantity: number;
        unit_type: string;
    };

    [SystemEvents.PURCHASE_CREATED]: {
        purchase_id: string;
        supplier_id?: string;
        item_type: string;
        total_amount: number;
        paid_amount: number;
        factory_id: string;
        payment_mode: string;
        userId: string;
        description?: string;
        purchase_date?: string;
    };

    [SystemEvents.PURCHASE_PAYMENT_RECORDED]: {
        payment_id: string;
        purchase_id?: string;
        supplier_id: string;
        amount: number;
        payment_mode: string;
        factory_id: string;
        userId: string;
        notes?: string;
    };

    [SystemEvents.SALES_PAYMENT_RECORDED]: {
        payment_id: string;
        order_id: string;
        amount: number;
        payment_mode: string;
        userId: string;
        customer_id: string;
        factory_id: string;
    };

    [SystemEvents.SALES_DISPATCH_BATCH_RECORDED]: {
        dispatch_id: string;
        order_id: string;
        customer_id: string;
        user_id: string;
        payment_mode: string;
        subtotal: number;
        discount: number;
        total: number;
        initial_payment: number;
        payment_id?: string | null;
        order_status: string;
        items: Array<{ item_id: string; quantity: number; unit_price: number }>;
    };

    [SystemEvents.CASH_FLOW_LOGGED]: {
        log_id: string;
        date: string;
        category_id: string;
        category_name: string;
        factory_id: string | null;
        amount: number;
        payment_mode: string;
        reference_id: string | null;
        notes: string | null;
        is_automatic: boolean;
    };
}
