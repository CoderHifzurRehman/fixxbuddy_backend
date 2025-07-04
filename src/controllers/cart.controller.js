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
      status: 'addToCart',
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
    const cartItems = await Cart.find({
        userId: req.user.id,
        status: 'addToCart' // Only return items with this status
    });
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

// @desc    Get all user's orders (all statuses)
// @route   GET /api/cart/list-all
// @access  Private
const getAllOrders = async (req, res) => {
  try {
    const orders = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching orders'
    });
  }
};

// @desc    Get orders by status
// @route   GET /api/cart/orders/:status
// @access  Private
const getOrdersByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    
    // Validate status input
    const validStatuses = ['pending', 'inProgress', 'completed', 'cancelled', 'all'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status parameter'
      });
    }

    let query = { userId: req.user.id };
    
    // If status isn't 'all', add status filter
    if (status !== 'all') {
      query.status = status;
    }

    const orders = await Cart.find(query)
      .sort({ createdAt: -1 })
      .populate('assignedPartner', 'name specialization phone'); // Optional: populate partner details

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders by status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching orders'
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
      userId: req.user.id,
        status: 'addToCart'
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
    await Cart.deleteMany({ 
        userId: req.user.id, 
        status: 'addToCart' 
    });
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

const getAllUsersDetails = async (req, res) => {
  try {
    // First get all pending requests with user data
    const pendingRequests = await Cart.find({ status: 'pending' })
      .populate('userId', 'firstName lastName email phone address');
    
    // Group by user and count requests
    const usersMap = new Map();
    
    pendingRequests.forEach(request => {
      const userId = request.userId._id.toString();
      if (!usersMap.has(userId)) {
        usersMap.set(userId, {
          user: request.userId,
          count: 0
        });
      }
      usersMap.get(userId).count++;
    });
    
    // Convert map to array
    const usersWithCounts = Array.from(usersMap.values());
    
    res.status(200).json({
      success: true,
      data: usersWithCounts
    });
  } catch (error) {
    console.error('Error fetching users with requests:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users with requests'
    });
  }
};

const getUserRequests = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const requests = await Cart.find({ 
      userId: userId,
    }).populate('serviceId', 'serviceName serviceCost description');
    
    res.status(200).json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching user requests:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user requests'
    });
  }
};

// @desc    Get single order details with tracking info
// @route   GET /api/cart/:orderId
// @access  Private
const getOrderDetails = async (req, res) => {
  try {
    const order = await Cart.findById(req.params.orderId)
      .populate('userId', 'firstName lastName email phone address')
      .populate('assignedPartner', 'fullName phone email specialization');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if the requesting user owns this order or is admin
    if (order.userId._id.toString() !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this order'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching order details'
    });
  }
};

// @desc    Update cart item status (Admin version)
// @route   PUT /api/cart/admin/update-status/:cartItemId
// @access  Private/Admin
const adminUpdateCartItemStatus = async (req, res) => {
  try {
    const { status, assignedPartner, scheduledDate, tracking } = req.body;
    
    const updateData = { status };
    
    if (assignedPartner) updateData.assignedPartner = assignedPartner;
    if (scheduledDate) updateData.scheduledDate = scheduledDate;
    if (tracking) updateData.$push = { tracking: { $each: tracking } };

    const updatedItem = await Cart.findByIdAndUpdate(
      req.params.cartItemId,
      updateData,
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


module.exports = {
  addToCart,
  getCartItems,
  getAllOrders,
  getOrdersByStatus,
  updateCartItem,
  updateCartItemStatus,
  removeFromCart,
  clearCart,
  getAllUsersDetails,
  getUserRequests,
  getOrderDetails, // Add this new export
  adminUpdateCartItemStatus
};
