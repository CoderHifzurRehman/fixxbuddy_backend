const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const cartController = require('../controllers/cart.controller');

// Base URL: /api/cart

// Add item to cart (authenticated users only)
router.post('/add', authMiddleware, cartController.addToCart);

// Get user's cart items (authenticated users only)
router.get('/list', authMiddleware, cartController.getCartItems);

// Get user's all order items (authenticated users only)
router.get('/list-all', authMiddleware, cartController.getAllOrders);

// Get user's all order items (authenticated users only)
router.get('/orders/:status', authMiddleware, cartController.getOrdersByStatus);

// Update cart item quantity (authenticated users only)
router.put('/update/:cartItemId', authMiddleware, cartController.updateCartItem);

// Update cart status item quantity (authenticated users only)
router.put('/update-status/:cartItemId', authMiddleware, cartController.updateCartItemStatus); // Add this line


// Remove item from cart (authenticated users only)
router.delete('/remove/:cartItemId', authMiddleware, cartController.removeFromCart);

// Clear entire cart (authenticated users only)
router.delete('/clear', authMiddleware, cartController.clearCart);

//user list who try to activity in services like add to cart or order and others etc.

router.get('/users', cartController.getAllUsersDetails);

module.exports = router;