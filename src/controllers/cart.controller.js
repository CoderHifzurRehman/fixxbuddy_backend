const Cart = require('../models/cart.model');
const MainservicesCategories = require('../models/mainServicesCategories.model')
const Application = require('../models/applicationType.model');
const mongoose = require('mongoose');

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
    }).lean();

    // Fetch additional details in parallel
    const enhancedItems = await Promise.all(cartItems.map(async (item) => {
      try {
        // Initialize with default values
        let mainServiceName = 'Not specified';
        let applicationName = 'Not specified';

        // Only try to fetch main service name if we have a valid ID
        if (item.mainServiceId && mongoose.isValidObjectId(item.mainServiceId)) {
          const mainService = await MainservicesCategories.findById(item.mainServiceId)
            .select('serviceName')
            .lean();
          mainServiceName = mainService?.serviceName || mainServiceName;
        }

        // Only try to fetch application name if we have a valid ID
        if (item.applicationId && mongoose.isValidObjectId(item.applicationId)) {
          console.log(item);
          
          const application = await Application.findById(item.applicationId)
            .select('serviceName')
            .lean();
          applicationName = application?.serviceName || applicationName;
        }

        return {
          ...item,
          mainServiceName,
          applicationName
        };
      } catch (err) {
        console.error(`Error enhancing cart item ${item._id}:`, err);
        return {
          ...item,
          mainServiceName: 'Error loading',
          applicationName: 'Error loading'
        };
      }
    }));
    res.status(200).json({
      success: true,
      count: enhancedItems.length,
      data: enhancedItems
    });
  } catch (error) {
    console.error('Error fetching cart items:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching cart items',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get all user's orders (all statuses)
// @route   GET /api/cart/list-all
// @access  Private
const getAllOrders = async (req, res) => {
  try {
    const orders = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    
    // Fetch additional details in parallel
    const enhancedItems = await Promise.all(orders.map(async (item) => {
      try {
        // Initialize with default values
        let mainServiceName = 'Not specified';
        let applicationName = 'Not specified';

        // Only try to fetch main service name if we have a valid ID
        if (item.mainServiceId && mongoose.isValidObjectId(item.mainServiceId)) {
          const mainService = await MainservicesCategories.findById(item.mainServiceId)
            .select('serviceName')
            .lean();
          mainServiceName = mainService?.serviceName || mainServiceName;
        }

        // Only try to fetch application name if we have a valid ID
        if (item.applicationId && mongoose.isValidObjectId(item.applicationId)) {
          console.log(item);
          
          const application = await Application.findById(item.applicationId)
            .select('serviceName')
            .lean();
          applicationName = application?.serviceName || applicationName;
        }

        return {
          ...item,
          mainServiceName,
          applicationName
        };
      } catch (err) {
        console.error(`Error enhancing cart item ${item._id}:`, err);
        return {
          ...item,
          mainServiceName: 'Error loading',
          applicationName: 'Error loading'
        };
      }
    }));
    res.status(200).json({
      success: true,
      count: enhancedItems.length,
      data: enhancedItems
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
      .populate('assignedPartner', 'name contactNumber specialization phone'); // Optional: populate partner details

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

// @desc    Update cart item status with address/contact info
// @route   PUT /api/cart/update-status/:cartItemId
// @access  Private
const updateCartItemStatus = async (req, res) => {
  try {
    const { status, deliveryAddress, contactNumber } = req.body;
    
    // Validate status input
    const validStatuses = ['addToCart', 'pending', 'inProgress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    // When changing to pending status, require address and phone
    if (status === 'pending' && (!deliveryAddress || !contactNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address and contact number are required for pending status'
      });
    }

    const updateData = { status };
    
    // Only update address/contact when changing to pending status
    if (status === 'pending') {
      updateData.deliveryAddress = deliveryAddress;
      updateData.contactNumber = contactNumber;
    }

    const updatedItem = await Cart.findOneAndUpdate(
      { 
        _id: req.params.cartItemId, 
        userId: req.user.id 
      },
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

// @desc    Get all users with their request counts (filtered by status)
// @route   GET /api/cart/users
// @access  Private/Admin
const getAllUsersDetails = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;

    // Base query for requests
    let requestQuery = {};
    if (status && status !== 'all') {
      requestQuery.status = status;
    }

    // First get all requests with user data that match the status filter
    const requests = await Cart.find(requestQuery)
      .populate('userId', 'firstName lastName email contactNumbers')
      .lean();

    // Group by user and count requests
    const usersMap = new Map();
    
    requests.forEach(request => {
      if (!request.userId) return; // Skip if no user associated
      
      const userId = request.userId._id.toString();
      if (!usersMap.has(userId)) {
        usersMap.set(userId, {
          user: request.userId,
          count: 0,
          statuses: new Set() // Track all statuses for this user's requests
        });
      }
      const userData = usersMap.get(userId);
      userData.count++;
      userData.statuses.add(request.status);
    });

    // Convert map to array and apply search filter if provided
    let usersWithCounts = Array.from(usersMap.values());

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      usersWithCounts = usersWithCounts.filter(userData => {
        const user = userData.user;
        return (
          user.firstName.toLowerCase().includes(searchLower) ||
          user.lastName.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower) ||
          user._id.toString().toLowerCase().includes(searchLower) ||
          user.phone?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply pagination
    const totalCount = usersWithCounts.length;
    const paginatedUsers = usersWithCounts.slice(skip, skip + parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        users: paginatedUsers,
        totalCount
      }
    });
  } catch (error) {
    console.error('Error fetching users with requests:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users with requests'
    });
  }
};

// @desc    Get all requests for a specific user
// @route   GET /api/cart/user-requests/:userId
// @access  Private/Admin
const getUserRequests = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const requests = await Cart.find({ 
      userId: userId,
    }).populate('serviceId', 'serviceName serviceCost description deliveryAddress contactNumber')
      .populate('assignedPartner', 'fullName contactNumber email expertise');
    
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
      .populate('assignedPartner', 'fullName contactNumber email expertise')
      .populate('serviceId', 'serviceName serviceCost description');

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
    if (tracking) {
      updateData.$push = { 
        tracking: { 
          $each: Array.isArray(tracking) ? tracking : [tracking],
          $sort: { date: -1 } // Sort tracking by date descending
        } 
      };
    }

    const updatedItem = await Cart.findByIdAndUpdate(
      req.params.cartItemId,
      updateData,
      { new: true }
    )
    .populate('assignedPartner', 'fullName contactNumber email expertise')
    .populate('serviceId', 'serviceName serviceCost description');

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
  adminUpdateCartItemStatus,
};
