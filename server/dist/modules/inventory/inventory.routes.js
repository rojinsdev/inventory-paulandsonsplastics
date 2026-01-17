"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const inventory_controller_1 = require("./inventory.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// All inventory endpoints require production_manager role (Mobile only)
router.use(auth_1.authenticate, (0, auth_1.requireRole)('production_manager'));
router.post('/pack', inventory_controller_1.inventoryController.pack);
router.post('/bundle', inventory_controller_1.inventoryController.bundle);
router.get('/stock/:id', inventory_controller_1.inventoryController.getStock);
router.get('/stock', inventory_controller_1.inventoryController.listAll);
exports.default = router;
