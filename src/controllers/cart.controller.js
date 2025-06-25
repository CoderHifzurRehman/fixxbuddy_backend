const Cart = require('../models/cart.model');

// @desc    Add item to cart
// @route   POST /api/cart/add
// @access  Private
const addToCart = async (req, res) => {
    console.log(req.body);
    
  try {
    // Works for both JSON and form-data
    const { 
      serviceId, 
      serviceName, 
      serviceCost, 
      serviceImage, 
      mainServiceId, 
      applicationId 
    } = req.body;

    // Rest of your existing code...
    const existingItem = await Cart.findOne({ 
      userId: req.user.id, 
      serviceId 
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Item already exists in cart'
      });
    }

    const cartItem = await Cart.create({
      userId: req.user.id,
      serviceId,
      serviceName,
      serviceCost: Number(serviceCost), // Ensure number type
      serviceImage,
      mainServiceId,
      applicationId,
      status: 'addToCart'
    });

    res.status(201).json({
      success: true,
      data: cartItem
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding to cart'
    });
  }
};

// @desc    Get user's cart items
// @route   GET /api/cart/list
// @access  Private
const getCartItems = async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.id });
    res.status(200).json({
      success: true,
      count: cartItems.length,
      data: cartItems
    });
  } catch (error) {
    console.error('Error fetching cart items:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching cart items'
    });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart/update/:cartItemId
// @access  Private
const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    
    const updatedItem = await Cart.findOneAndUpdate(
      { 
        _id: req.params.cartItemId, 
        userId: req.user.id 
      },
      { quantity },
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    res.status(200).json({
      success: true,
      data: updatedItem
    });
  } catch (error) {
    console.error('Error updating cart item:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating cart item'
    });
  }
};

// @desc    Update cart item status
// @route   PUT /api/cart/update-status/:cartItemId
// @access  Private
const updateCartItemStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const updatedItem = await Cart.findOneAndUpdate(
      { 
        _id: req.params.cartItemId, 
        userId: req.user.id 
      },
      { status },
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    res.status(200).json({
      success: true,
      data: updatedItem
    });
  } catch (error) {
    console.error('Error updating cart item status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating cart item status'
    });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/remove/:cartItemId
// @access  Private
const removeFromCart = async (req, res) => {
  try {
    const deletedItem = await Cart.findOneAndDelete({ 
      _id: req.params.cartItemId, 
      userId: req.user.id 
    });

    if (!deletedItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while removing from cart'
    });
  }
};

// @desc    Clear user's cart
// @route   DELETE /api/cart/clear
// @access  Private
const clearCart = async (req, res) => {
  try {
    await Cart.deleteMany({ userId: req.user.id });
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while clearing cart'
    });
  }
};

module.exports = {
  addToCart,
  getCartItems,
  updateCartItem,
  updateCartItemStatus,
  removeFromCart,
  clearCart
};