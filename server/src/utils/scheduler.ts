import cron from 'node-cron';
import { HealthUtility } from './health';
import { config } from '../config/env';
import logger from './logger';
import { purchaseService } from '../modules/purchases/purchase.service';
import { salesOrderService } from '../modules/sales-orders/sales-order.service';

export class Scheduler {
    static init() {
        console.log('📅 Initializing background scheduler...');

        // 1. Daily Health Status (at 09:00 AM every day)
        cron.schedule('0 9 * * *', async () => {
            logger.info('🕒 Sending Daily Health Status...');
            await this.sendHealthStatus();
        });

        // 2. Daily Dues & Overdue Check (at 08:00 AM every day)
        cron.schedule('0 8 * * *', async () => {
            logger.info('🕒 Running Daily Dues & Overdue Check...');
            try {
                await purchaseService.checkAndUpdatePurchaseDues();
                await salesOrderService.checkAndUpdateOverdueOrders();
                logger.info('✅ Daily Dues & Overdue Check completed');
            } catch (error) {
                logger.error('❌ Failed to run Daily Dues & Overdue Check:', error);
            }
        });

        logger.info('📅 Scheduler initialized: Daily health & Daily dues check active');
    }

    static async sendHealthStatus() {
        if (!config.telegram.token || !config.telegram.chatId) {
            logger.warn('⚠️ Telegram not configured: Skipping health status report');
            return;
        }

        try {
            const report = await HealthUtility.getReport();
            const message = HealthUtility.formatReportForTelegram(report);

            const response = await fetch(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: config.telegram.chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Telegram API Error: ${JSON.stringify(errorData)}`);
            }

            logger.info('✅ Hourly health status sent to Telegram');
        } catch (error) {
            logger.error('❌ Failed to send health status to Telegram:', error);
        }
    }
}
