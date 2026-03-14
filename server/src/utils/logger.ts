import winston from 'winston';
import path from 'path';
import Transport from 'winston-transport';
import { config } from '../config/env';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Custom format for console (more readable for devs)
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        process.env.NODE_ENV === 'development' ? combine(colorize(), consoleFormat) : json()
    ),
    transports: [
        new winston.transports.Console(),
        // Only write to files in production
        ...(process.env.NODE_ENV === 'production' ? [
            new winston.transports.File({
                filename: path.join(__dirname, '../../logs/error.log'),
                level: 'error',
                maxsize: 5242880, // 5MB
                maxFiles: 5,
            }),
            new winston.transports.File({
                filename: path.join(__dirname, '../../logs/combined.log'),
                maxsize: 5242880, // 5MB
                maxFiles: 5,
            })
        ] : []),
        // Telegram Alerts for Errors
        ...(config.telegram.token && config.telegram.chatId ? [
            new (class TelegramTransport extends Transport {
                constructor(opts?: any) {
                    super(opts);
                    (this as any).level = 'error';
                }

                log(info: any, callback: () => void) {
                    setImmediate(() => this.emit('logged', info));

                    const { level, message, timestamp, stack, ...meta } = info;
                    const emoji = level === 'error' ? '🔴' : '⚠️';

                    const text = `${emoji} <b>System Alert</b>\n\n` +
                        `<b>Level:</b> ${level.toUpperCase()}\n` +
                        `<b>Time:</b> ${timestamp}\n` +
                        `<b>Message:</b> ${message}\n` +
                        (stack ? `\n<b>Stack:</b>\n<code>${stack.slice(0, 500)}...</code>` : '') +
                        (Object.keys(meta).length ? `\n\n<b>Context:</b>\n<code>${JSON.stringify(meta, null, 2)}</code>` : '');

                    fetch(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: config.telegram.chatId,
                            text,
                            parse_mode: 'HTML'
                        })
                    }).catch(() => {
                        // Fail silently
                    });

                    callback();
                }
            })()
        ] : [])
    ],
    exitOnError: false,
});

export default logger;
