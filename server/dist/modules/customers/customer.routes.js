"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const customer_controller_1 = require("./customer.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// All customer endpoints require admin role (Web only)
router.use(auth_1.authenticate, (0, auth_1.requireRole)('admin'));
router.post('/', customer_controller_1.customerController.create);
router.get('/', customer_controller_1.customerController.list);
router.get('/:id', customer_controller_1.customerController.get);
router.put('/:id', customer_controller_1.customerController.update);
router.delete('/:id', customer_controller_1.customerController.delete);
exports.default = router;
