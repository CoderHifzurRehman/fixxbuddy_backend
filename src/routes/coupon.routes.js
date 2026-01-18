const express = require('express');
const router = express.Router();
const couponController = require('../controllers/coupon.controller');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

// Create a new coupon (Admin only)
router.post('/create', [authMiddleware, authorizeRoles('admin', 'subadmin')], couponController.createCoupon);

// Get all coupons (Admin only - optional filtering)
router.get('/list', [authMiddleware, authorizeRoles('admin', 'subadmin')], couponController.getAllCoupons);

// Get coupon by ID (Admin only)
router.get('/:id', [authMiddleware, authorizeRoles('admin', 'subadmin')], couponController.getCouponById);

// Update coupon (Admin only)
router.put('/update/:id', [authMiddleware, authorizeRoles('admin', 'subadmin')], couponController.updateCoupon);

// Delete coupon (Admin only)
router.delete('/:id', [authMiddleware, authorizeRoles('admin', 'subadmin')], couponController.deleteCoupon);

// Validate coupon (Public)
router.post('/validate', couponController.validateCoupon);

module.exports = router;
