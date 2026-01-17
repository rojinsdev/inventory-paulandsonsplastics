"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const machine_product_controller_1 = require("./machine-product.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// All machine-product mapping endpoints require admin role (Web only)
router.use(auth_1.authenticate, (0, auth_1.requireRole)('admin'));
router.post('/', machine_product_controller_1.machineProductController.create);
router.get('/', machine_product_controller_1.machineProductController.list);
router.get('/:id', machine_product_controller_1.machineProductController.get);
router.put('/:id', machine_product_controller_1.machineProductController.update);
router.delete('/:id', machine_product_controller_1.machineProductController.delete);
exports.default = router;
