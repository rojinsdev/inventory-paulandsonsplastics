import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${nodeEnv}` });
dotenv.config(); // Fallback to .env for shared or default vars

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default('3000'),
    SUPABASE_URL: z.string().url(),
    SUPABASE_KEY: z.string().min(20),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    SHEETS_SYNC_ENABLED: z.string().optional(),
    GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_PATH: z.string().optional(),
    SHEETS_SNAPSHOT_CRON: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    process.exit(1);
}

export const config = {
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    supabase: {
        url: parsed.data.SUPABASE_URL,
        key: parsed.data.SUPABASE_KEY,
    },
    allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(','),
    telegram: {
        token: parsed.data.TELEGRAM_BOT_TOKEN,
        chatId: parsed.data.TELEGRAM_CHAT_ID,
    },
    firebase: {
        projectId: parsed.data.FIREBASE_PROJECT_ID,
        serviceAccountPath: parsed.data.FIREBASE_SERVICE_ACCOUNT_PATH,
    },
    sentry: {
        dsn: parsed.data.SENTRY_DSN,
    },
    sheets: {
        enabled: ['true', '1'].includes((parsed.data.SHEETS_SYNC_ENABLED || '').toLowerCase()),
        spreadsheetId: parsed.data.GOOGLE_SHEETS_SPREADSHEET_ID || '',
        serviceAccountJson: parsed.data.GOOGLE_SERVICE_ACCOUNT_JSON,
        serviceAccountPath: parsed.data.GOOGLE_SERVICE_ACCOUNT_PATH,
        snapshotCron: parsed.data.SHEETS_SNAPSHOT_CRON || '15 2 * * *',
    },
};
