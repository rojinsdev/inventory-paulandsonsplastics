import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
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


dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Inventory Production System API is running' });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (no authentication required)
app.use('/api/auth', authRoutes);

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

export default app;
