import './instrument';
import http from 'http';
import app from './app';
import { config } from './config/env';
import logger from './utils/logger';
import { Scheduler } from './utils/scheduler';

const PORT = config.port;

const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Server running in ${config.nodeEnv} mode on port ${PORT}`);
    logger.info(`🌐 Listening on all network interfaces (0.0.0.0)`);

    // Initialize Scheduler
    Scheduler.init();
});

process.on('unhandledRejection', (err: any) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down...', err);
    server.close(() => {
        process.exit(1);
    });
});
