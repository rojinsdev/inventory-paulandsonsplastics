import http from 'http';
import app from './app';
import { config } from './config/env';
import logger from './utils/logger';
import { Scheduler } from './utils/scheduler';

const PORT = config.port;

const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running in ${config.nodeEnv} mode on port ${PORT}`);

    // Initialize Scheduler
    Scheduler.init();
});

process.on('unhandledRejection', (err: any) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down...', err);
    server.close(() => {
        process.exit(1);
    });
});
