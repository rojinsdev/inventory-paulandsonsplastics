import { readFileSync } from 'fs';
import { google, sheets_v4 } from 'googleapis';
import { config } from '../../config/env';
import { supabase } from '../../config/supabase';
import logger from '../../utils/logger';
import { GOOGLE_SHEET_TABS } from './google-sheets.constants';

type Sheets = sheets_v4.Sheets;

let cachedClient: InstanceType<typeof google.auth.JWT> | null = null;
let cachedSheets: Sheets | null = null;

function loadServiceAccount(): { client_email: string; private_key: string } | null {
    const path = config.sheets.serviceAccountPath?.trim();
    if (path) {
        try {
            const raw = readFileSync(path, 'utf8');
            const j = JSON.parse(raw) as { client_email: string; private_key: string };
            if (!j.client_email || !j.private_key) return null;
            return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, '\n') };
        } catch (e) {
            logger.error('[GoogleSheets] Failed to read GOOGLE_SERVICE_ACCOUNT_PATH', { e });
            return null;
        }
    }
    const json = config.sheets.serviceAccountJson?.trim();
    if (!json) return null;
    try {
        const j = JSON.parse(json) as { client_email: string; private_key: string };
        if (!j.client_email || !j.private_key) return null;
        return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, '\n') };
    } catch (e) {
        logger.error('[GoogleSheets] Invalid GOOGLE_SERVICE_ACCOUNT_JSON', { e });
        return null;
    }
}

function getSheetsApi(): Sheets | null {
    if (!config.sheets.enabled) return null;
    if (!config.sheets.spreadsheetId) {
        logger.warn('[GoogleSheets] SHEETS_SYNC_ENABLED but GOOGLE_SHEETS_SPREADSHEET_ID missing');
        return null;
    }
    const sa = loadServiceAccount();
    if (!sa) {
        logger.warn('[GoogleSheets] SHEETS_SYNC_ENABLED but no service account JSON/path');
        return null;
    }
    if (!cachedSheets) {
        cachedClient = new google.auth.JWT({
            email: sa.client_email,
            key: sa.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        cachedSheets = google.sheets({ version: 'v4', auth: cachedClient });
    }
    return cachedSheets;
}

export class GoogleSheetsService {
    isReady(): boolean {
        return getSheetsApi() !== null && !!config.sheets.spreadsheetId;
    }

    /**
     * Append one or more rows to a tab. Values are written as USER_ENTERED.
     */
    async appendRows(tabName: string, rows: (string | number | null | undefined)[][]): Promise<void> {
        const api = getSheetsApi();
        if (!api || rows.length === 0) return;

        const values = rows.map((r) =>
            r.map((c) => (c === null || c === undefined ? '' : String(c)))
        );

        try {
            await api.spreadsheets.values.append({
                spreadsheetId: config.sheets.spreadsheetId,
                range: `'${tabName.replace(/'/g, "''")}'!A:ZZ`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values },
            });
        } catch (err) {
            logger.error('[GoogleSheets] appendRows failed', { tabName, err });
            throw err;
        }
    }

    /** Daily snapshot: one row per customer with current balances. */
    async appendCustomersSnapshot(): Promise<void> {
        const { data, error } = await supabase
            .from('customers')
            .select('id, name, balance_due, credit_limit')
            .order('name');

        if (error) {
            logger.error('[GoogleSheets] appendCustomersSnapshot query failed', { error });
            return;
        }

        const ts = new Date().toISOString();
        const rows =
            data?.map((c) => [
                ts,
                c.id,
                c.name ?? '',
                c.balance_due ?? 0,
                c.credit_limit ?? '',
            ]) ?? [];

        if (rows.length === 0) return;

        await this.appendRows(GOOGLE_SHEET_TABS.Customers_snapshot, rows);
        logger.info('[GoogleSheets] Customers_snapshot rows appended', { count: rows.length });
    }

    /** Daily snapshot: one row per supplier. */
    async appendSuppliersSnapshot(): Promise<void> {
        const { data, error } = await supabase
            .from('suppliers')
            .select('id, name, balance_due, credit_limit')
            .order('name');

        if (error) {
            logger.error('[GoogleSheets] appendSuppliersSnapshot query failed', { error });
            return;
        }

        const ts = new Date().toISOString();
        const rows =
            data?.map((s) => [
                ts,
                s.id,
                s.name ?? '',
                s.balance_due ?? 0,
                s.credit_limit ?? '',
            ]) ?? [];

        if (rows.length === 0) return;

        await this.appendRows(GOOGLE_SHEET_TABS.Suppliers_snapshot, rows);
        logger.info('[GoogleSheets] Suppliers_snapshot rows appended', { count: rows.length });
    }

    async runDailySnapshots(): Promise<void> {
        if (!this.isReady()) return;
        try {
            await this.appendCustomersSnapshot();
            await this.appendSuppliersSnapshot();
        } catch (e) {
            logger.error('[GoogleSheets] runDailySnapshots failed', { e });
        }
    }
}

export const googleSheetsService = new GoogleSheetsService();
