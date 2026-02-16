const Cart = require('../models/cart.model');
const MainservicesCategories = require('../models/mainServicesCategories.model')
const Application = require('../models/applicationType.model');
const ServiceType = require('../models/serviceType.model');
const mongoose = require('mongoose');
const ably = require('../utils/ably');


const generateOrderId = () => {
  const prefix = "FBORD";
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase(); // Last 4 chars of timestamp
  const randomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";

  for (let i = 0; i < 4; i++) { // Shorter random part since timestamp helps
    suffix += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }

  return `${prefix}${timestamp}${suffix}`; // e.g., FBORDK8J3X2
};

// @desc    Add item to cart
// @route   POST /api/cart/add
// @access  Private
const addToCart = async (req, res) => {
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
      orderId: generateOrderId(),
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
          const application = await Application.findById(item.applicationId)
            .select('serviceName')
            .lean();
          applicationName = application?.serviceName || applicationName;
        }

        // Fetch ServiceType details for discount
        let serviceDiscountPercentage = 0;
        let serviceDiscountValidUntil = null;

        if (item.serviceId && mongoose.isValidObjectId(item.serviceId)) {
          const serviceType = await ServiceType.findById(item.serviceId)
            .select('discountPercentage discountValidUntil serviceCost')
            .lean();
          if (serviceType) {
            serviceDiscountPercentage = serviceType.discountPercentage || 0;
            serviceDiscountValidUntil = serviceType.discountValidUntil || null;

            // Check validity
            const now = new Date();
            const validUntil = serviceDiscountValidUntil ? new Date(serviceDiscountValidUntil) : null;

            if (serviceDiscountPercentage > 0 && (!validUntil || validUntil >= now)) {
              // Calculate discount amount for display
              // Use serviceCost from DB if available (more reliable), else fallback to cart item cost
              let baseCost = item.serviceCost;
              if (serviceType.serviceCost && !isNaN(Number(serviceType.serviceCost))) {
                // Only use if valid number
                // baseCost = Number(serviceType.serviceCost); 
                // Actually, cart item cost is what user added. Let's stick to item.serviceCost for consistency
                // unless we want to reflect price changes. For now use item.serviceCost.
              }

              const discountAmount = (baseCost * serviceDiscountPercentage) / 100;

              // Populate these fields for frontend display even if not yet saved in DB
              item.discountAmount = discountAmount;
              item.serviceLevelDiscountAmount = discountAmount;
              item.serviceLevelDiscountPercentage = serviceDiscountPercentage;
              item.originalServiceCost = baseCost;
              item.finalAmount = baseCost - discountAmount;
            }
          }
        }

        return {
          ...item,
          mainServiceName,
          applicationName,
          serviceDiscountPercentage,
          serviceDiscountValidUntil
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
          const application = await Application.findById(item.applicationId)
            .select('serviceName')
            .lean();
          applicationName = application?.serviceName || applicationName;
        }

        // Fetch ServiceType details to display original discount if needed
        // Note: For completed/past orders, we should ideally use the stored snapshot values (serviceLevelDiscountPercentage, etc.)
        // But for display consistency or if the snapshot is missing (legacy data), we can try to fetch current
        let serviceDiscountPercentage = item.serviceLevelDiscountPercentage || 0;
        let serviceDiscountValidUntil = null; // Stored validity not kept, but maybe not needed for past orders

        // If snapshot missing, try current (though price might have changed)
        if (serviceDiscountPercentage === 0 && item.serviceId && mongoose.isValidObjectId(item.serviceId)) {
          const serviceType = await ServiceType.findById(item.serviceId)
            .select('discountPercentage discountValidUntil')
            .lean();
          if (serviceType) {
            serviceDiscountPercentage = serviceType.discountPercentage || 0;
            serviceDiscountValidUntil = serviceType.discountValidUntil || null;
          }
        }

        return {
          ...item,
          mainServiceName,
          applicationName,
          serviceDiscountPercentage,
          serviceDiscountValidUntil
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
    const { status, deliveryAddress, contactNumber, couponCode } = req.body;

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

    let updateData = { status };

    // Logic for Checkout (changing status to pending)
    if (status === 'pending') {
      const cartItem = await Cart.findById(req.params.cartItemId);
      if (!cartItem) {
        return res.status(404).json({ success: false, message: 'Cart item not found' });
      }

      // 1. Fetch Service details to get current price and service-level discount
      const service = await ServiceType.findById(cartItem.serviceId);
      if (!service) {
        // Fallback if service not found, though unlikely
        console.warn(`Service ${cartItem.serviceId} not found for cart item ${cartItem._id}`);
      }

      // Calculate Service Level Pricing
      let originalCost = cartItem.serviceCost;
      // Use service cost from DB if available for security, otherwise fallback to cart item cost
      // Note: serviceCost in ServiceType is String in model but should check if matches
      if (service && service.serviceCost) {
        const dbCost = Number(service.serviceCost);
        if (!isNaN(dbCost) && dbCost > 0) {
          originalCost = dbCost;
        }
      }

      let serviceDiscountPercent = 0;
      let serviceDiscountAmount = 0;

      if (service && service.discountPercentage > 0) {
        // Check if discount is still valid
        const now = new Date();
        const validUntil = service.discountValidUntil ? new Date(service.discountValidUntil) : null;

        if (!validUntil || validUntil >= now) {
          serviceDiscountPercent = service.discountPercentage;
          serviceDiscountAmount = (originalCost * serviceDiscountPercent) / 100;
        }
      }

      let amountAfterServiceDiscount = originalCost - serviceDiscountAmount;

      // 2. Calculate Coupon Discount
      let couponDiscountAmount = 0;
      let appliedCouponCode = null;

      if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        if (coupon && coupon.isValid()) {
          // Validate if coupon applies to this service
          let isApplicable = false;
          // Logic similar to validateCoupon but for single item
          // We need to fetch applicationTypeId for the service
          // If service object is available
          if (service) {
            for (const rule of coupon.applicableTo) {
              if (service.applicationTypeId && service.applicationTypeId.toString() === rule.applicationTypeId.toString()) {
                if (rule.serviceTypeIds.length === 0) {
                  isApplicable = true;
                } else if (rule.serviceTypeIds.map(id => id.toString()).includes(service._id.toString())) {
                  isApplicable = true;
                }
              }
              if (isApplicable) break;
            }
          }

          if (isApplicable) {
            // Calculate coupon discount
            const cDiscount = (amountAfterServiceDiscount * coupon.discountPercentage) / 100;
            couponDiscountAmount = cDiscount;

            if (coupon.maxDiscountAmount && couponDiscountAmount > coupon.maxDiscountAmount) {
              couponDiscountAmount = coupon.maxDiscountAmount;
            }
            appliedCouponCode = coupon.code;
          }
        }
      }

      // 3. Final Calculation
      let finalAmount = amountAfterServiceDiscount - couponDiscountAmount;
      if (finalAmount < 0) finalAmount = 0;

      // Prepare update data with all pricing fields
      updateData = {
        ...updateData,
        deliveryAddress,
        contactNumber,
        originalServiceCost: originalCost,
        serviceLevelDiscountPercentage: serviceDiscountPercent,
        serviceLevelDiscountAmount: serviceDiscountAmount,
        couponCode: appliedCouponCode,
        couponDiscountAmount: couponDiscountAmount,
        finalAmount: finalAmount,
        // Keep existing field for backward compatibility if needed, or update it
        serviceCost: originalCost, // Update base cost to match DB if changed
        discountAmount: serviceDiscountAmount + couponDiscountAmount // Total discount
      };
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

    if (status === 'pending') {
      ably.channels.get("admin-channel").publish("new_request", {
        message: "New service request received",
        userId: req.user.id,
        orderId: updatedItem._id
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
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = 'requestedDate', // New: added sorting
      sortOrder = 'desc' // New: added sort order
    } = req.query;
    const skip = (page - 1) * limit;

    // Base query for requests
    let requestQuery = {};
    if (status && status !== 'all') {
      requestQuery.status = status;
    }

    // First get all requests with user data that match the status filter
    const requests = await Cart.find(requestQuery)
      .populate('userId', 'firstName lastName email contactNumbers')
      .sort({ createdAt: -1 }) // Sort requests by creation date
      .lean();

    // Group by user and count requests with additional data for sorting
    const usersMap = new Map();

    requests.forEach(request => {
      if (!request.userId) return; // Skip if no user associated

      const userId = request.userId._id.toString();
      if (!usersMap.has(userId)) {
        usersMap.set(userId, {
          user: request.userId,
          count: 0,
          statuses: new Set(),
          latestRequestDate: request.createdAt, // Track latest request date
          earliestRequestDate: request.createdAt, // Track earliest request date
          requests: [] // Store individual requests for additional processing
        });
      }

      const userData = usersMap.get(userId);
      userData.count++;
      userData.statuses.add(request.status);
      userData.requests.push({
        createdAt: request.createdAt,
        status: request.status
      });

      // Update latest request date
      if (new Date(request.createdAt) > new Date(userData.latestRequestDate)) {
        userData.latestRequestDate = request.createdAt;
      }

      // Update earliest request date
      if (new Date(request.createdAt) < new Date(userData.earliestRequestDate)) {
        userData.earliestRequestDate = request.createdAt;
      }
    });

    // Convert map to array and apply search filter if provided
    let usersWithCounts = Array.from(usersMap.values());

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      usersWithCounts = usersWithCounts.filter(userData => {
        const user = userData.user;
        return (
          user.firstName?.toLowerCase().includes(searchLower) ||
          user.lastName?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user._id?.toString().toLowerCase().includes(searchLower) ||
          user.contactNumbers?.some(contact =>
            contact.number?.toLowerCase().includes(searchLower)
          )
        );
      });
    }

    // Apply sorting
    usersWithCounts.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'requestedDate':
          aValue = new Date(a.latestRequestDate);
          bValue = new Date(b.latestRequestDate);
          break;

        case 'requestCount':
          aValue = a.count;
          bValue = b.count;
          break;

        case 'userName':
          aValue = `${a.user.firstName || ''} ${a.user.lastName || ''}`.toLowerCase();
          bValue = `${b.user.firstName || ''} ${b.user.lastName || ''}`.toLowerCase();
          break;

        case 'earliestRequest':
          aValue = new Date(a.earliestRequestDate);
          bValue = new Date(b.earliestRequestDate);
          break;

        default:
          aValue = new Date(a.latestRequestDate);
          bValue = new Date(b.latestRequestDate);
      }

      // Handle null/undefined values
      if (aValue == null) aValue = sortBy === 'requestCount' ? 0 : new Date(0);
      if (bValue == null) bValue = sortBy === 'requestCount' ? 0 : new Date(0);

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    // Apply pagination
    const totalCount = usersWithCounts.length;
    const paginatedUsers = usersWithCounts.slice(skip, skip + parseInt(limit));

    // Format response data
    const formattedUsers = paginatedUsers.map(userData => ({
      user: userData.user,
      count: userData.count,
      latestRequestDate: userData.latestRequestDate,
      earliestRequestDate: userData.earliestRequestDate,
      statuses: Array.from(userData.statuses)
    }));

    res.status(200).json({
      success: true,
      data: {
        users: formattedUsers,
        totalCount,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        sortBy,
        sortOrder
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

    if (assignedPartner) {
      ably.channels.get(`partner-${assignedPartner}`).publish("task_assigned", {
        message: "A new task has been assigned to you",
        taskId: updatedItem._id
      });

      // Also notify admin to refresh their view if needed
      ably.channels.get("admin-channel").publish("task_updated", {
        message: "Task assigned to partner",
        taskId: updatedItem._id
      });

      // Notify User (Customer)
      ably.channels.get(`user-${updatedItem.userId}`).publish("order_status_updated", {
        message: "A partner has been assigned to your request",
        taskId: updatedItem._id,
        status: "assigned"
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
