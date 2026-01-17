"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const machine_routes_1 = __importDefault(require("./modules/machines/machine.routes"));
const product_routes_1 = __importDefault(require("./modules/products/product.routes"));
const production_routes_1 = __importDefault(require("./modules/production/production.routes"));
const inventory_routes_1 = __importDefault(require("./modules/inventory/inventory.routes"));
const machine_product_routes_1 = __importDefault(require("./modules/machine-products/machine-product.routes"));
const customer_routes_1 = __importDefault(require("./modules/customers/customer.routes"));
const sales_order_routes_1 = __importDefault(require("./modules/sales-orders/sales-order.routes"));
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
app.get('/', (req, res) => {
    res.json({ message: 'Inventory Production System API is running' });
});
// Auth routes (no authentication required)
app.use('/api/auth', auth_routes_1.default);
// Protected routes (authentication required - will be added per route)
app.use('/api/machines', machine_routes_1.default);
app.use('/api/products', product_routes_1.default);
app.use('/api/production', production_routes_1.default);
app.use('/api/inventory', inventory_routes_1.default);
app.use('/api/machine-products', machine_product_routes_1.default);
app.use('/api/customers', customer_routes_1.default);
app.use('/api/sales-orders', sales_order_routes_1.default);
exports.default = app;
