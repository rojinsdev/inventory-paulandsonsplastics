"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const product_controller_1 = require("./product.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// All product endpoints require admin role (Web only)
router.use(auth_1.authenticate, (0, auth_1.requireRole)('admin'));
router.post('/', product_controller_1.productController.create);
router.get('/', product_controller_1.productController.list);
router.get('/:id', product_controller_1.productController.get);
router.put('/:id', product_controller_1.productController.update);
router.delete('/:id', product_controller_1.productController.delete);
exports.default = router;
