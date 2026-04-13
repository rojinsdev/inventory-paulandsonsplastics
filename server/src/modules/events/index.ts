import logger from '../../utils/logger';
import { registerAuditHandlers } from './handlers/audit.handler';
import { registerNotificationHandlers } from './handlers/notification.handler';
import { registerFinanceHandlers } from './handlers/finance.handler';
import { registerSheetsHandlers } from './handlers/sheets.handler';

/**
 * Initializes all system event handlers.
 * This should be called once during application startup.
 */
export function initEventHandlers() {
    logger.info('Initializing System Event Handlers...');

    try {
        registerAuditHandlers();
        registerNotificationHandlers();
        registerFinanceHandlers();
        registerSheetsHandlers();
        
        logger.info('System Event Handlers initialized successfully.');
    } catch (error) {
        logger.error('Failed to initialize event handlers', { error });
        // We don't want to crash the whole app if handler registration fails, 
        // but it's a critical error for system integrity.
    }
}
