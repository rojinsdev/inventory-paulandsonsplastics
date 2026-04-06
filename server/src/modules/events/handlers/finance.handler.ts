import { eventBus } from '../../../core/eventBus';
import { SystemEvents, EventPayloads } from '../../../core/events';
import { cashFlowService } from '../../cash-flow/cash-flow.service';
import logger from '../../../utils/logger';

/**
 * Registers all finance-related event listeners.
 */
export function registerFinanceHandlers() {
    logger.info('[FinanceHandler] Registering listeners...');

    // 1. Purchase Created -> Log cash flow if paid_amount > 0
    eventBus.on(SystemEvents.PURCHASE_CREATED, async (payload: EventPayloads[SystemEvents.PURCHASE_CREATED]) => {
        if (payload.paid_amount <= 0) return;

        try {
            const categoryName = payload.item_type === 'Raw Material' ? 'Raw Material Purchase' : 'Company Purchase';
            const categoryId = await cashFlowService.getCategoryId(categoryName, 'expense');
            
            await cashFlowService.logEntry({
                date: payload.purchase_date || new Date().toISOString().split('T')[0],
                category_id: categoryId,
                factory_id: payload.factory_id,
                amount: payload.paid_amount,
                payment_mode: payload.payment_mode || 'Cash',
                reference_id: payload.purchase_id,
                notes: `Auto: ${payload.description || payload.item_type}`,
                is_automatic: true
            });
            logger.info('[FinanceHandler] Logged purchase cash flow', { purchaseId: payload.purchase_id });
        } catch (error) {
            logger.error('[FinanceHandler] Failed to log purchase cash flow', { error, purchaseId: payload.purchase_id });
        }
    });

    // 2. Purchase Payment Recorded
    eventBus.on(SystemEvents.PURCHASE_PAYMENT_RECORDED, async (payload: EventPayloads[SystemEvents.PURCHASE_PAYMENT_RECORDED]) => {
        try {
            const categoryId = await cashFlowService.getCategoryId('Supplier Payment', 'expense');
            await cashFlowService.logEntry({
                date: new Date().toISOString().split('T')[0],
                category_id: categoryId,
                factory_id: payload.factory_id,
                amount: payload.amount,
                payment_mode: payload.payment_mode,
                reference_id: payload.payment_id,
                notes: `Auto: ${payload.notes || ''}`,
                is_automatic: true
            });
            logger.info('[FinanceHandler] Logged purchase payment', { paymentId: payload.payment_id });
        } catch (error) {
            logger.error('[FinanceHandler] Failed to log purchase payment', { error, paymentId: payload.payment_id });
        }
    });

    // 3. Sales Payment Recorded
    eventBus.on(SystemEvents.SALES_PAYMENT_RECORDED, async (payload: EventPayloads[SystemEvents.SALES_PAYMENT_RECORDED]) => {
        try {
            const categoryId = await cashFlowService.getCategoryId('Sales Payment', 'income');
            await cashFlowService.logEntry({
                date: new Date().toISOString().split('T')[0],
                category_id: categoryId,
                factory_id: payload.factory_id,
                amount: payload.amount,
                payment_mode: payload.payment_mode,
                reference_id: payload.payment_id,
                notes: `Auto: Order Payment`,
                is_automatic: true
            });
            logger.info('[FinanceHandler] Logged sales payment', { paymentId: payload.payment_id });
        } catch (error) {
            logger.error('[FinanceHandler] Failed to log sales payment', { error, paymentId: payload.payment_id });
        }
    });
}
