import { eventBus } from '../../../core/eventBus';
import { SystemEvents, EventPayloads } from '../../../core/events';
import { supabase } from '../../../config/supabase';
import { pushNotificationService } from '../../notifications/push-notification.service';
import logger from '../../../utils/logger';

const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

/**
 * Registers all notification-related event listeners.
 */
export function registerNotificationHandlers() {
    logger.info('[NotificationHandler] Registering listeners...');

    // 1. Sales Order Created -> Notify Production Managers & Admins
    eventBus.on(SystemEvents.SALES_ORDER_CREATED, async (payload: EventPayloads[SystemEvents.SALES_ORDER_CREATED]) => {
        try {
            const { order_id, items, delivery_date } = payload;
            const shortOrderId = order_id.slice(-6).toUpperCase();

            const factoryIds = new Set<string>();
            for (const item of items) {
                if (item.product_id) {
                    const { data: product } = await supabase
                        .from('products')
                        .select('factory_id')
                        .eq('id', item.product_id)
                        .single();
                    factoryIds.add(product?.factory_id || MAIN_FACTORY_ID);
                } else if (item.cap_id) {
                    const { data: cap } = await supabase
                        .from('caps')
                        .select('factory_id')
                        .eq('id', item.cap_id)
                        .single();
                    factoryIds.add(cap?.factory_id || MAIN_FACTORY_ID);
                } else {
                    factoryIds.add(MAIN_FACTORY_ID);
                }
            }

            const pushData = { order_id, type: 'sales_order' };

            for (const factoryId of factoryIds) {
                const { data: managers } = await supabase
                    .from('user_profiles')
                    .select('id')
                    .eq('role', 'production_manager')
                    .eq('factory_id', factoryId);

                for (const manager of managers ?? []) {
                    try {
                        await supabase.from('notifications').insert({
                            user_id: manager.id,
                            title: 'New Sales Order Needs Preparation',
                            message: `Order #${shortOrderId} has items from your factory. Delivery scheduled for ${delivery_date || 'ASAP'}.`,
                            type: 'sales_order_preparation',
                            metadata: { order_id }
                        });
                    } catch (notifyError) {
                        logger.error('[NotificationHandler] Failed internal notification', { managerId: manager.id, orderId: order_id });
                    }
                }

                await pushNotificationService.sendToRole(
                    'production_manager',
                    {
                        title: 'New Sales Order Received',
                        body: `Order #${shortOrderId} requires items from your factory.`,
                        data: pushData
                    },
                    factoryId
                );
            }

            await pushNotificationService.sendToRole('admin', {
                title: 'New Sales Order Received',
                body: `Order #${shortOrderId} was placed.`,
                data: pushData
            });
        } catch (error) {
            logger.error('[NotificationHandler] Error in SALES_ORDER_CREATED handler', { error, orderId: payload.order_id });
        }
    });

    // 2. Sales Order Status Updated -> Notify Customer or Admin
    eventBus.on(SystemEvents.SALES_ORDER_STATUS_UPDATED, async (payload: EventPayloads[SystemEvents.SALES_ORDER_STATUS_UPDATED]) => {
        // Future logic: Send push to customer or alert admin of cancellation
        logger.info('[NotificationHandler] Order status updated notification (logic pending)', { orderId: payload.order_id, status: payload.new_status });
    });
}
