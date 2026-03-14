import cron from 'node-cron';
import { HealthUtility } from './health';
import { config } from '../config/env';
import logger from './logger';

export class Scheduler {
    static init() {
        console.log('📅 Initializing background scheduler...');

        // Hourly Health Status (0 * * * * = at the start of every hour)
        cron.schedule('0 * * * *', async () => {
            await this.sendHealthStatus();
        });

        // Log initialization
        logger.info('📅 Scheduler initialized: Hourly health status active');
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
