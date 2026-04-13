import { eventBus } from '../../../core/eventBus';
import { SystemEvents, EventPayloads } from '../../../core/events';
import logger from '../../../utils/logger';
import { googleSheetsService } from '../../integrations/google-sheets.service';
import { GOOGLE_SHEET_TABS } from '../../integrations/google-sheets.constants';

function runSheets(label: string, fn: () => Promise<void>): void {
    void (async () => {
        if (!googleSheetsService.isReady()) return;
        try {
            await fn();
        } catch (e) {
            logger.error(`[SheetsHandler] ${label} failed`, { e });
        }
    })();
}

/**
 * Mirrors business events to Google Sheets (optional; feature-flagged).
 * Never throws to callers — failures are logged only.
 */
export function registerSheetsHandlers() {
    logger.info('[SheetsHandler] Registering listeners...');

    eventBus.on(SystemEvents.SALES_ORDER_CREATED, (payload: EventPayloads[SystemEvents.SALES_ORDER_CREATED]) => {
        runSheets('SALES_ORDER_CREATED', async () => {
            const ts = new Date().toISOString();
            await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Sales_orders, [
                [
                    ts,
                    'order_created',
                    payload.order_id,
                    payload.customer_id,
                    payload.total_amount,
                    Array.isArray(payload.items) ? payload.items.length : 0,
                    payload.delivery_date ?? '',
                    payload.userId,
                ],
            ]);
        });
    });

    eventBus.on(SystemEvents.SALES_ORDER_STATUS_CHANGED, (payload: EventPayloads[SystemEvents.SALES_ORDER_STATUS_CHANGED]) => {
        runSheets('SALES_ORDER_STATUS_CHANGED', async () => {
            const ts = new Date().toISOString();
            await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Sales_orders, [
                [
                    ts,
                    'status_changed',
                    payload.order_id,
                    '',
                    '',
                    `${payload.previous_status}→${payload.new_status}`,
                    '',
                    payload.userId,
                ],
            ]);
        });
    });

    eventBus.on(SystemEvents.SALES_ORDER_ITEMS_PREPARED, (payload: EventPayloads[SystemEvents.SALES_ORDER_ITEMS_PREPARED]) => {
        runSheets('SALES_ORDER_ITEMS_PREPARED', async () => {
            const ts = new Date().toISOString();
            await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Sales_orders, [
                [
                    ts,
                    'items_prepared',
                    payload.order_id,
                    '',
                    '',
                    JSON.stringify(payload.items ?? []).slice(0, 5000),
                    '',
                    payload.userId,
                ],
            ]);
        });
    });

    eventBus.on(SystemEvents.SALES_PAYMENT_RECORDED, (payload: EventPayloads[SystemEvents.SALES_PAYMENT_RECORDED]) => {
        runSheets('SALES_PAYMENT_RECORDED', async () => {
            const ts = new Date().toISOString();
            await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Customer_payments, [
                [
                    ts,
                    payload.payment_id,
                    payload.order_id,
                    payload.customer_id,
                    payload.amount,
                    payload.payment_mode,
                    payload.factory_id,
                    payload.userId,
                ],
            ]);
        });
    });

    eventBus.on(
        SystemEvents.SALES_DISPATCH_BATCH_RECORDED,
        (payload: EventPayloads[SystemEvents.SALES_DISPATCH_BATCH_RECORDED]) => {
            runSheets('SALES_DISPATCH_BATCH_RECORDED', async () => {
                const ts = new Date().toISOString();
                const lineRows = payload.items.map((it) => [
                    ts,
                    payload.dispatch_id,
                    payload.order_id,
                    payload.customer_id,
                    it.item_id,
                    it.quantity,
                    it.unit_price,
                    Number(it.quantity) * Number(it.unit_price),
                    payload.payment_mode,
                    payload.order_status,
                    payload.user_id,
                ]);
                await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Sales_dispatch_lines, lineRows);

                await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Sales_orders, [
                    [
                        ts,
                        'dispatch_batch',
                        payload.order_id,
                        payload.customer_id,
                        payload.total,
                        `subtotal=${payload.subtotal};discount=${payload.discount};initial_payment=${payload.initial_payment};dispatch=${payload.dispatch_id}`,
                        '',
                        payload.user_id,
                    ],
                ]);
            });
        }
    );

    eventBus.on(SystemEvents.PURCHASE_CREATED, (payload: EventPayloads[SystemEvents.PURCHASE_CREATED]) => {
        runSheets('PURCHASE_CREATED', async () => {
            const ts = new Date().toISOString();
            await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Purchases, [
                [
                    ts,
                    'purchase_created',
                    payload.purchase_id ?? '',
                    payload.supplier_id ?? '',
                    payload.total_amount,
                    payload.paid_amount,
                    payload.item_type,
                    payload.factory_id,
                    payload.userId,
                    payload.description ?? '',
                ],
            ]);
        });
    });

    eventBus.on(SystemEvents.PURCHASE_PAYMENT_RECORDED, (payload: EventPayloads[SystemEvents.PURCHASE_PAYMENT_RECORDED]) => {
        runSheets('PURCHASE_PAYMENT_RECORDED', async () => {
            const ts = new Date().toISOString();
            await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Purchases, [
                [
                    ts,
                    'supplier_payment',
                    payload.payment_id,
                    payload.supplier_id,
                    '',
                    payload.amount,
                    '',
                    payload.factory_id,
                    payload.userId,
                    [payload.notes ?? '', payload.purchase_id ? `purchase_id=${payload.purchase_id}` : '']
                        .filter(Boolean)
                        .join(' | '),
                ],
            ]);
        });
    });

    eventBus.on(SystemEvents.CASH_FLOW_LOGGED, (payload: EventPayloads[SystemEvents.CASH_FLOW_LOGGED]) => {
        runSheets('CASH_FLOW_LOGGED', async () => {
            const ts = new Date().toISOString();
            await googleSheetsService.appendRows(GOOGLE_SHEET_TABS.Cash_flow, [
                [
                    ts,
                    payload.log_id,
                    payload.date,
                    payload.category_id,
                    payload.category_name,
                    payload.factory_id ?? '',
                    payload.amount,
                    payload.payment_mode,
                    payload.reference_id ?? '',
                    payload.notes ?? '',
                    payload.is_automatic ? 'yes' : 'no',
                ],
            ]);
        });
    });

    logger.info('[SheetsHandler] Listeners registered.');
}
