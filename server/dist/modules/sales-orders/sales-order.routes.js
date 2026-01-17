"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sales_order_controller_1 = require("./sales-order.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// All sales order endpoints require admin role (Web only)
router.use(auth_1.authenticate, (0, auth_1.requireRole)('admin'));
router.post('/', sales_order_controller_1.salesOrderController.create);
router.get('/', sales_order_controller_1.salesOrderController.list);
router.get('/:id', sales_order_controller_1.salesOrderController.get);
router.patch('/:id/status', sales_order_controller_1.salesOrderController.updateStatus);
router.delete('/:id', sales_order_controller_1.salesOrderController.delete);
exports.default = router;
