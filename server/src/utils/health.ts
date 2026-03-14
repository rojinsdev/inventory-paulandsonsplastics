import os from 'os';
import { supabase } from '../config/supabase';

export interface HealthReport {
    status: 'ok' | 'error';
    timestamp: string;
    uptime: {
        process: number;
        system: number;
    };
    memory: {
        free: number;
        total: number;
        usage_percent: number;
        process_rss: number;
        process_heap_used: number;
        process_heap_total: number;
    };
    cpu: {
        load_avg: number[];
        cores: number;
    };
    database: {
        connected: boolean;
        latency_ms?: number;
        error?: string;
    };
    environment: {
        node_version: string;
        platform: string;
        env: string;
    };
}

export class HealthUtility {
    static async getReport(): Promise<HealthReport> {
        const start = Date.now();
        let dbConnected = false;
        let dbError: string | undefined;
        let dbLatency: number | undefined;

        try {
            const { error } = await supabase.from('factories').select('id', { count: 'exact', head: true }).limit(1);
            dbLatency = Date.now() - start;
            if (error) {
                dbError = error.message;
            } else {
                dbConnected = true;
            }
        } catch (err: any) {
            dbError = err instanceof Error ? err.message : String(err);
        }

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memoryUsage = process.memoryUsage();

        return {
            status: dbConnected ? 'ok' : 'error',
            timestamp: new Date().toISOString(),
            uptime: {
                process: process.uptime(),
                system: os.uptime(),
            },
            memory: {
                free: freeMem,
                total: totalMem,
                usage_percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
                process_rss: memoryUsage.rss,
                process_heap_used: memoryUsage.heapUsed,
                process_heap_total: memoryUsage.heapTotal,
            },
            cpu: {
                load_avg: os.loadavg(),
                cores: os.cpus().length,
            },
            database: {
                connected: dbConnected,
                latency_ms: dbLatency,
                error: dbError,
            },
            environment: {
                node_version: process.version,
                platform: process.platform,
                env: process.env.NODE_ENV || 'development',
            },
        };
    }

    static formatReportForTelegram(report: HealthReport): string {
        const statusEmoji = report.status === 'ok' ? '✅' : '❌';
        const dbEmoji = report.database.connected ? '🟢' : '🔴';

        const uptimeHours = Math.floor(report.uptime.process / 3600);
        const uptimeMins = Math.floor((report.uptime.process % 3600) / 60);

        return `<b>${statusEmoji} System Health Report</b>\n\n` +
            `<b>Time:</b> ${new Date(report.timestamp).toLocaleString()}\n` +
            `<b>Status:</b> ${report.status.toUpperCase()}\n` +
            `<b>Uptime:</b> ${uptimeHours}h ${uptimeMins}m\n\n` +
            `<b>💾 Memory:</b>\n` +
            `Total: ${(report.memory.total / (1024 * 1024 * 1024)).toFixed(2)} GB\n` +
            `Usage: ${report.memory.usage_percent}%\n` +
            `Process RSS: ${(report.memory.process_rss / (1024 * 1024)).toFixed(2)} MB\n\n` +
            `<b>📊 CPU:</b>\n` +
            `Load (1/5/15m): ${report.cpu.load_avg.map(l => l.toFixed(2)).join(', ')}\n` +
            `Cores: ${report.cpu.cores}\n\n` +
            `<b>🗄️ Database:</b>\n` +
            `Status: ${dbEmoji} ${report.database.connected ? 'Connected' : 'Disconnected'}\n` +
            (report.database.latency_ms ? `Latency: ${report.database.latency_ms}ms\n` : '') +
            (report.database.error ? `Error: <code>${report.database.error}</code>\n` : '') +
            `\n<b>🌐 Env:</b> ${report.environment.env} (${report.environment.node_version})`;
    }
}
