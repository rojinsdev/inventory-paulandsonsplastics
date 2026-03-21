import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import machineRoutes from './modules/machines/machine.routes';
import productRoutes from './modules/products/product.routes';
import productionRoutes from './modules/production/production.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import machineProductRoutes from './modules/machine-products/machine-product.routes';
import customerRoutes from './modules/customers/customer.routes';
import salesOrderRoutes from './modules/sales-orders/sales-order.routes';
import authRoutes from './modules/auth/auth.routes';
import settingsRoutes from './modules/settings/settings.routes';
import auditRoutes from './modules/audit/audit.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import planningRoutes from './modules/planning/planning.routes';
import reportRoutes from './modules/reports/reports.routes';
import factoryRoutes from './modules/factories/factory.routes';
import capRoutes from './modules/inventory/cap.routes';
import cashFlowRoutes from './modules/cash-flow/cash-flow.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import logger from './utils/logger';






dotenv.config();

const app = express();

app.use(helmet());

// CORS Policy
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps)
        if (!origin) return callback(null, true);

        // Allow localhost in dev, and specific allowed origins or Vercel previews in prod
        const isAllowed = allowedOrigins.includes(origin) || 
                         origin.includes('localhost') ||
                         origin.includes('127.0.0.1') ||
                         origin.endsWith('.vercel.app') || 
                         process.env.NODE_ENV === 'development' ||
                         !process.env.NODE_ENV; // Default to dev if not set

        if (isAllowed) {
            callback(null, true);
        } else {
            logger.warn(`Blocked by CORS: ${origin}`);
            callback(null, false);
        }
    },
    credentials: true,
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10kb' })); // Body parser limit to prevent DoS

// Global Rate Limiter
app.use('/api', apiLimiter);

app.get('/', (req, res) => {
    res.json({ message: 'Inventory Production System API is running' });
});

import { HealthUtility } from './utils/health';

app.get('/health', async (req, res) => {
    try {
        const report = await HealthUtility.getReport();
        res.status(report.status === 'ok' ? 200 : 500).json(report);
    } catch (err: any) {
        res.status(500).json({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString()
        });
    }
});

// Auth routes (no authentication required)
// Apply stricter rate limiting to auth routes
app.use('/api/auth', authLimiter, authRoutes);

// Protected routes (authentication required - will be added per route)
app.use('/api/machines', machineRoutes);
app.use('/api/products', productRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/machine-products', machineProductRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', salesOrderRoutes); // Note: frontend uses /orders, backend uses /sales-orders (consistency check needed, but kept same as current code which imports as salesOrderRoutes)
app.use('/api/settings', settingsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/factories', factoryRoutes);
app.use('/api/caps', capRoutes);
app.use('/api/cash-flow', cashFlowRoutes);
app.use('/api/notifications', notificationRoutes);



// Global Error Handler
import { errorHandler } from './middleware/errorHandler';
app.use(errorHandler);



export default app;

