"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const machine_controller_1 = require("./machine.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// All machine endpoints require admin role (Web only)
router.use(auth_1.authenticate, (0, auth_1.requireRole)('admin'));
router.post('/', machine_controller_1.machineController.create);
router.get('/', machine_controller_1.machineController.list);
router.get('/:id', machine_controller_1.machineController.get);
router.put('/:id', machine_controller_1.machineController.update);
router.delete('/:id', machine_controller_1.machineController.delete);
exports.default = router;
