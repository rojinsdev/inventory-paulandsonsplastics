import { eventBus } from '../../../core/eventBus';
import { SystemEvents, EventPayloads } from '../../../core/events';
import { AuditService } from '../../audit/audit.service';
import logger from '../../../utils/logger';

const auditService = new AuditService();

/**
 * Registers all audit-related event listeners.
 */
export function registerAuditHandlers() {
    logger.info('[AuditHandler] Registering listeners...');

    // 1. Sales Order Created
    eventBus.on(SystemEvents.SALES_ORDER_CREATED, async (payload: EventPayloads[SystemEvents.SALES_ORDER_CREATED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'CREATE',
                'sales_order',
                payload.order_id,
                { 
                    total_amount: payload.total_amount, 
                    items_count: payload.items?.length || 0,
                    customer_id: payload.customer_id
                }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log SALES_ORDER_CREATED', { error, orderId: payload.order_id });
        }
    });

    // 2. Sales Order Status Updated
    eventBus.on(SystemEvents.SALES_ORDER_STATUS_UPDATED, async (payload: EventPayloads[SystemEvents.SALES_ORDER_STATUS_UPDATED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'UPDATE_STATUS',
                'sales_order',
                payload.order_id,
                { 
                    old_status: payload.old_status,
                    new_status: payload.new_status
                }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log SALES_ORDER_STATUS_UPDATED', { error, orderId: payload.order_id });
        }
    });

    // 3. Production Submitted
    eventBus.on(SystemEvents.PRODUCTION_SUBMITTED, async (payload: EventPayloads[SystemEvents.PRODUCTION_SUBMITTED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'SUBMIT_PRODUCTION',
                'production_log',
                payload.production_id,
                { 
                    machine_id: payload.machine_id, 
                    product_id: payload.product_id, 
                    quantity: payload.quantity,
                    factory_id: payload.factory_id
                }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log PRODUCTION_SUBMITTED', { error, productionId: payload.production_id });
        }
    });

    // 4. Purchase Created
    eventBus.on(SystemEvents.PURCHASE_CREATED, async (payload: EventPayloads[SystemEvents.PURCHASE_CREATED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'CREATE',
                'purchase',
                payload.purchase_id,
                { 
                    supplier_id: payload.supplier_id, 
                    item_type: payload.item_type, 
                    total_amount: payload.total_amount,
                    paid_amount: payload.paid_amount
                }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log PURCHASE_CREATED', { error, purchaseId: payload.purchase_id });
        }
    });

    // 5. Cap Production Submitted
    eventBus.on(SystemEvents.CAP_PRODUCTION_SUBMITTED, async (payload: EventPayloads[SystemEvents.CAP_PRODUCTION_SUBMITTED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'SUBMIT_CAP_PRODUCTION',
                'cap_production_logs',
                payload.production_id,
                { 
                    cap_id: payload.cap_id, 
                    quantity: payload.quantity,
                    factory_id: payload.factory_id
                }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log CAP_PRODUCTION_SUBMITTED', { error, productionId: payload.production_id });
        }
    });

    // 6. Inner Production Submitted
    eventBus.on(SystemEvents.INNER_PRODUCTION_SUBMITTED, async (payload: EventPayloads[SystemEvents.INNER_PRODUCTION_SUBMITTED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'SUBMIT_INNER_PRODUCTION',
                'inner_production_logs',
                payload.production_id,
                { 
                    inner_id: payload.inner_id, 
                    quantity: payload.quantity,
                    factory_id: payload.factory_id
                }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log INNER_PRODUCTION_SUBMITTED', { error, productionId: payload.production_id });
        }
    });

    // 7. Production Request Status Updated
    eventBus.on(SystemEvents.PRODUCTION_REQUEST_STATUS_UPDATED, async (payload: EventPayloads[SystemEvents.PRODUCTION_REQUEST_STATUS_UPDATED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'UPDATE_STATUS',
                'production_requests',
                payload.request_id,
                { status: payload.status }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log PRODUCTION_REQUEST_STATUS_UPDATED', { error, requestId: payload.request_id });
        }
    });

    // 8. Sales Order Status Changed
    eventBus.on(SystemEvents.SALES_ORDER_STATUS_CHANGED, async (payload: EventPayloads[SystemEvents.SALES_ORDER_STATUS_CHANGED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'UPDATE_STATUS',
                'sales_order',
                payload.order_id,
                { 
                    previous_status: payload.previous_status, 
                    new_status: payload.new_status 
                }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log SALES_ORDER_STATUS_CHANGED', { error, orderId: payload.order_id });
        }
    });

    // 9. Purchase Payment Recorded
    eventBus.on(SystemEvents.PURCHASE_PAYMENT_RECORDED, async (payload: EventPayloads[SystemEvents.PURCHASE_PAYMENT_RECORDED]) => {
        try {
            await auditService.logAction(
                payload.userId,
                'RECORD_PAYMENT',
                'purchase_payments',
                payload.payment_id,
                { 
                    purchase_id: payload.purchase_id,
                    supplier_id: payload.supplier_id,
                    amount: payload.amount 
                }
            );
        } catch (error) {
            logger.error('[AuditHandler] Failed to log PURCHASE_PAYMENT_RECORDED', { error, paymentId: payload.payment_id });
        }
    });
}
