const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const cartController = require('../controllers/cart.controller');

// Base URL: /api/cart

// Add item to cart (authenticated users only)
router.post('/add', authMiddleware, cartController.addToCart);

// Get user's cart items (authenticated users only)
router.get('/list', authMiddleware, cartController.getCartItems);

// Update cart item quantity (authenticated users only)
router.put('/update/:cartItemId', authMiddleware, cartController.updateCartItem);

// Remove item from cart (authenticated users only)
router.delete('/remove/:cartItemId', authMiddleware, cartController.removeFromCart);

// Clear entire cart (authenticated users only)
router.delete('/clear', authMiddleware, cartController.clearCart);

module.exports = router;