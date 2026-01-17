"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const production_controller_1 = require("./production.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// All production endpoints require production_manager role (Mobile only)
router.use(auth_1.authenticate, (0, auth_1.requireRole)('production_manager'));
router.post('/submit', production_controller_1.productionController.submit);
router.get('/', production_controller_1.productionController.list);
router.get('/daily/:date', production_controller_1.productionController.getDailyProduction);
exports.default = router;
