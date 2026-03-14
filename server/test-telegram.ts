import logger from './src/utils/logger';
import dotenv from 'dotenv';
dotenv.config();

console.log('Sending test error to Telegram...');
logger.error('Test Alert: Telegram Integration is Live! 🚀', {
    test: true,
    system: 'PaulAndSonsPlastics',
    context: 'Initial Setup Verification'
});

setTimeout(() => {
    console.log('Test complete. Check your Telegram!');
    process.exit(0);
}, 2000);
