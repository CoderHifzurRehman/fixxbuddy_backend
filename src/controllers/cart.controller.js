const Cart = require('../models/cart.model');
const MainservicesCategories = require('../models/mainServicesCategories.model')
const Application = require('../models/applicationType.model');
const ServiceType = require('../models/serviceType.model');
const Coupon = require('../models/coupon.model');
const Hub = require('../models/hub.model');
const Partner = require('../models/partner.model');
const Expertise = require('../models/expertise.model');
const mongoose = require('mongoose');
const ably = require('../utils/ably');
const { sendPushToUser, sendPushToPartner } = require('../utils/fcm');
const { createNotification } = require('../utils/notificationService');


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

    const serviceDoc = await ServiceType.findById(serviceId);
    const cartItem = await Cart.create({
      userId: req.user.id,
      orderId: generateOrderId(),
      serviceId,
      serviceName,
      serviceCost: Number(serviceCost), // Ensure number type
      serviceImage,
      mainServiceId,
      applicationId,
      warrantyMonths: (serviceDoc?.warrantyMonths !== undefined && serviceDoc?.warrantyMonths !== null) ? Number(serviceDoc.warrantyMonths) : 3,
      ...(((serviceDoc?.warrantyMonths !== undefined && serviceDoc?.warrantyMonths !== null) ? Number(serviceDoc.warrantyMonths) : 3) <= 0 ? {
        warrantyClaim: {
          claimed: false,
          status: 'not_applicable',
          notApplicableReason: 'Warranty is not applicable for this service'
        }
      } : {}),
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
    const orders = await Cart.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('assignedPartner', 'fullName firstName lastName contactNumber emergencyContactNumber email expertise profilePic averageRating totalRatings').populate('warrantyClaim.assignedPartner', 'fullName firstName lastName contactNumber emergencyContactNumber email expertise profilePic')
      .lean();

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
      .populate('assignedPartner', 'fullName firstName lastName contactNumber emergencyContactNumber email expertise profilePic averageRating totalRatings').populate('warrantyClaim.assignedPartner', 'fullName firstName lastName contactNumber emergencyContactNumber email expertise profilePic');

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

    // Logic for Cancellation
    if (status === 'cancelled') {
      const existingCartItem = await Cart.findOne({
        _id: req.params.cartItemId,
        userId: req.user.id
      });
      if (!existingCartItem) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      if (['completed', 'cancelled'].includes(existingCartItem.status)) {
        return res.status(400).json({ success: false, message: `Order is already ${existingCartItem.status}` });
      }

      // Check remaining time before scheduled visit
      let isWithinOneHour = false;
      if (existingCartItem.scheduledDate) {
        const visitTime = new Date(existingCartItem.scheduledDate);
        if (existingCartItem.scheduledStartTime) {
          const [h, m] = existingCartItem.scheduledStartTime.split(':').map(Number);
          if (!isNaN(h)) {
            visitTime.setHours(h, m || 0, 0, 0);
          }
        }
        const diffMs = visitTime.getTime() - Date.now();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours <= 1) {
          isWithinOneHour = true;
        }
      }

      let cancellationFee = 0;
      let cancellationFeeAccepted = false;

      if (isWithinOneHour) {
        if (!req.body.cancellationFeeAccepted) {
          return res.status(400).json({
            success: false,
            feeRequired: true,
            message: 'Partner visit is scheduled within 1 hour. A ₹100 cancellation fee applies and must be accepted to cancel.'
          });
        }
        cancellationFee = 100;
        cancellationFeeAccepted = true;
      }

      const trackingMsg = isWithinOneHour
        ? 'Booking cancelled by customer within 1 hour of scheduled visit. ₹100 cancellation fee applied (deducted from paid amount or added to next service).'
        : 'Booking cancelled by customer before 1 hour of scheduled visit.';

      updateData = {
        ...updateData,
        cancellationFee,
        cancellationFeeAccepted,
        cancelledAt: new Date(),
        $push: {
          tracking: {
            status: 'cancelled',
            message: trackingMsg,
            date: new Date()
          }
        }
      };
    }

    // Logic for Checkout (changing status to pending)
    if (status === 'pending') {
      const cartItem = await Cart.findById(req.params.cartItemId);
      if (!cartItem) {
        return res.status(404).json({ success: false, message: 'Cart item not found' });
      }

      // Check partner availability and expertise mapping
      const pincode = deliveryAddress?.postalCode;
      if (!pincode) {
        return res.status(400).json({
          success: false,
          message: 'Pincode is required to check serviceability.'
        });
      }

      // Step 1: Check general serviceability
      const hubs = await Hub.find({ pincodes: pincode, isActive: true });
      if (!hubs || hubs.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Your selected area is not serviceable.'
        });
      }
      const hubNames = hubs.map(h => h.name);

      // 1. Fetch Service details to get current price and service-level discount
      const service = await ServiceType.findById(cartItem.serviceId);
      if (!service) {
        return res.status(404).json({ success: false, message: 'Service not found' });
      }

      const appTypeId = service.applicationTypeId || cartItem.applicationId;
      if (!appTypeId) {
        return res.status(400).json({
          success: false,
          message: 'Service category mapping is missing for this item.'
        });
      }

      // Query expertise mapped to this applicationTypeId
      const expertises = await Expertise.find({
        "mappedServices.applicationTypeId": appTypeId
      });
      const matchingExpertiseNames = expertises.map(e => e.name);
      if (matchingExpertiseNames.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'This service has no mapped expertise.'
        });
      }

      // Step 2: Check if there is an active partner in those hubs with that expertise/designation
      const availablePartner = await Partner.findOne({
        isActive: true,
        isDeleted: false,
        hub: { $in: hubNames },
        $or: [
          { expertise: { $in: matchingExpertiseNames } },
          { designation: { $in: matchingExpertiseNames } }
        ]
      });

      if (!availablePartner) {
        return res.status(400).json({
          success: false,
          message: 'Currently no service partner with the required expertise is available in your area.'
        });
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
            appliedCouponCode = coupon.code;
            // Use the proportional discount calculated by frontend
            couponDiscountAmount = req.body.couponDiscountAmount || 0;
            
            // Safety caps
            if (coupon.maxDiscountAmount && couponDiscountAmount > coupon.maxDiscountAmount) {
              couponDiscountAmount = coupon.maxDiscountAmount;
            }
            if (couponDiscountAmount > amountAfterServiceDiscount) {
              couponDiscountAmount = amountAfterServiceDiscount;
            }
          }
        }
      }

      // 3. Final Calculation
      let finalAmount = amountAfterServiceDiscount - couponDiscountAmount;
      if (finalAmount < 0) finalAmount = 0;

      const now = new Date();

      // Prepare update data with all pricing fields and order creation timestamp
      updateData = {
        ...updateData,
        createdAt: now,
        orderedAt: now,
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

    if (status === 'cancelled' && updatedItem.assignedPartner) {
      try {
        ably.channels.get(`partner-${updatedItem.assignedPartner}`).publish('task_cancelled', {
          orderId: updatedItem.orderId || updatedItem._id,
          message: `Booking #${updatedItem.orderId || updatedItem._id} was cancelled by the customer.`
        });
      } catch (err) {
        console.warn('Ably notify partner error:', err);
      }
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
      if (status === 'warrantyClaims' || status === 'warrantyClaim') {
        requestQuery['warrantyClaim.claimed'] = true;
      } else {
        requestQuery.status = status;
      }
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
      if (request.warrantyClaim?.claimed) {
        userData.warrantyClaimsCount = (userData.warrantyClaimsCount || 0) + 1;
      }
      userData.statuses.add(request.status);
      userData.requests.push({
        _id: request._id,
        orderId: request.orderId,
        serviceName: request.serviceName,
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
        const matchesUser = (
          user.firstName?.toLowerCase().includes(searchLower) ||
          user.lastName?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user._id?.toString().toLowerCase().includes(searchLower) ||
          user.contactNumbers?.some(contact =>
            contact.number?.toLowerCase().includes(searchLower)
          )
        );
        const matchesRequest = userData.requests?.some(req =>
          req.orderId?.toLowerCase().includes(searchLower) ||
          req._id?.toString().toLowerCase().includes(searchLower) ||
          req.serviceName?.toLowerCase().includes(searchLower)
        );
        return matchesUser || matchesRequest;
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
      statuses: Array.from(userData.statuses),
      warrantyClaimsCount: userData.warrantyClaimsCount || 0,
      hasWarrantyClaim: (userData.warrantyClaimsCount || 0) > 0
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
      .populate('assignedPartner', 'fullName contactNumber emergencyContactNumber email expertise').populate('warrantyClaim.assignedPartner', 'fullName contactNumber emergencyContactNumber email expertise');

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
      .populate('assignedPartner', 'fullName firstName lastName contactNumber emergencyContactNumber email expertise profilePic averageRating totalRatings').populate('warrantyClaim.assignedPartner', 'fullName firstName lastName contactNumber emergencyContactNumber email expertise profilePic')
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

const getOrderInvoice = async (req, res) => {
  try {
    const query = mongoose.isValidObjectId(req.params.orderId)
      ? { $or: [{ _id: req.params.orderId }, { orderId: req.params.orderId }] }
      : { orderId: req.params.orderId };

    const order = await Cart.findOne(query)
      .populate('userId', 'firstName lastName email addresses contactNumbers')
      .populate('assignedPartner', 'firstName lastName contactNumber email address gstin gstNumber GSTIN')
      .populate('quotationId');

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
        message: 'Not authorized to access this invoice'
      });
    }

    if (order.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Invoice is only available for completed orders'
      });
    }

    const { generateInvoice } = require('../utils/invoiceGenerator');
    const doc = await generateInvoice(order);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice_${order.orderId || order._id}.pdf`);

    doc.pipe(res);
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating invoice PDF'
    });
  }
};

// @desc    Update cart item status (Admin version)
// @route   PUT /api/cart/admin/update-status/:cartItemId
// @access  Private/Admin
const adminUpdateCartItemStatus = async (req, res) => {
  try {
    const {
      status,
      assignedPartner,
      scheduledDate,
      scheduledSlot,
      scheduledStartTime,
      scheduledEndTime,
      tracking,
      cancelledBy,
      cancellationReason,
      cancellationNotes
    } = req.body;

    const existingItem = await Cart.findById(req.params.cartItemId);
    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    // Determine target status:
    // When a partner is assigned, the order status must transition to 'assigned' if it was pending or cart
    let targetStatus = status;
    if (assignedPartner) {
      if (!targetStatus || targetStatus === 'pending' || targetStatus === 'addToCart') {
        targetStatus = 'assigned';
      }
    } else if (assignedPartner === null || assignedPartner === '') {
      if (!targetStatus && existingItem.status === 'assigned') {
        targetStatus = 'pending';
      }
    }

    if (!targetStatus) {
      targetStatus = existingItem.status;
    }

    // Check if target status is completed and quotation is pending
    if (targetStatus === 'completed') {
      const Quotation = require('../models/quotation.model');
      const quotation = await Quotation.findOne({
        $or: [
          ...(existingItem.orderId ? [{ orderId: existingItem.orderId }] : []),
          { orderId: existingItem._id.toString() },
          ...(existingItem.quotationId ? [{ _id: existingItem.quotationId }] : [])
        ]
      });

      if (quotation && quotation.status !== 'Accepted' && quotation.status !== 'Rejected') {
        return res.status(400).json({
          success: false,
          message: 'Quotation approval pending. The customer must accept or reject the quotation before service can be completed.'
        });
      }
    }

    if (assignedPartner && targetStatus === 'addToCart') {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign a partner to a cart item. The request must be submitted or status updated first.'
      });
    }

    const updateData = {};
    if (targetStatus) updateData.status = targetStatus;

    if (assignedPartner !== undefined) {
      updateData.assignedPartner = assignedPartner || null;
    }

    if (req.body.warrantyClaimStatus !== undefined) {
      updateData['warrantyClaim.status'] = req.body.warrantyClaimStatus;
      if (req.body.warrantyClaimStatus === 'not_applicable') {
        const naMsg = req.body.warrantyNotApplicableReason || req.body.cancellationNotes || 'Marked not applicable by staff';
        updateData['warrantyClaim.notApplicableReason'] = naMsg;
        updateData['warrantyClaim.rejectionReason'] = naMsg;
      }
    }
    if (req.body.warrantyMonths !== undefined) {
      updateData.warrantyMonths = Number(req.body.warrantyMonths);
    }
    if (targetStatus === 'completed') {
      const finalWarrantyMonths = req.body.warrantyMonths !== undefined
        ? Number(req.body.warrantyMonths)
        : (existingItem.warrantyMonths !== undefined && existingItem.warrantyMonths !== null ? Number(existingItem.warrantyMonths) : 3);
      updateData.completedAt = updateData.completedAt || new Date();
      if (finalWarrantyMonths <= 0) {
        updateData.warrantyExpiresAt = null;
        if (!existingItem.warrantyClaim?.claimed) {
          updateData['warrantyClaim.status'] = 'not_applicable';
          updateData['warrantyClaim.notApplicableReason'] = 'Warranty is not applicable for this service';
        }
      } else {
        updateData.warrantyExpiresAt = new Date(updateData.completedAt.getTime() + finalWarrantyMonths * 30 * 24 * 60 * 60 * 1000);
      }
    }

    // Validate scheduled date & slot - Disallow assigning past date/time
    if (scheduledDate) {
      let checkDateTime = new Date(scheduledDate);
      if (scheduledStartTime) {
        const [sh, sm] = scheduledStartTime.split(':').map(Number);
        if (!isNaN(sh)) {
          checkDateTime.setHours(sh, sm || 0, 0, 0);
        }
      } else if (typeof scheduledDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
        // Just a date without time - check if before today (IST midnight)
        const todayZero = new Date();
        todayZero.setHours(0, 0, 0, 0);
        const inputZero = new Date(scheduledDate);
        inputZero.setHours(0, 0, 0, 0);
        if (inputZero < todayZero) {
          return res.status(400).json({
            success: false,
            message: 'Cannot schedule service for a past date. Please select today or a future date.'
          });
        }
      }

      // Allow 5 minutes leeway for submission delay
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (scheduledStartTime && checkDateTime.getTime() < fiveMinutesAgo) {
        return res.status(400).json({
          success: false,
          message: 'Cannot assign or reschedule to a past slot. The selected time has already passed for today.'
        });
      } else if (!scheduledStartTime && typeof scheduledDate === 'string' && /T\d{2}:\d{2}/.test(scheduledDate)) {
        if (checkDateTime.getTime() < fiveMinutesAgo) {
          return res.status(400).json({
            success: false,
            message: 'Cannot schedule in the past. Please select a future date and time slot.'
          });
        }
      }

      let dateStr = scheduledDate;
      if (typeof scheduledDate === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(scheduledDate)) {
        dateStr = `${scheduledDate}+05:30`;
      }
      updateData.scheduledDate = new Date(dateStr);

      if (scheduledSlot) updateData.scheduledSlot = scheduledSlot;
      if (scheduledStartTime) updateData.scheduledStartTime = scheduledStartTime;
      if (scheduledEndTime) updateData.scheduledEndTime = scheduledEndTime;

      if (existingItem.scheduledDate && (scheduledSlot !== existingItem.scheduledSlot || scheduledDate !== existingItem.scheduledDate?.toISOString())) {
        updateData.rescheduledAt = new Date();
      }
    } else {
      if (scheduledSlot) updateData.scheduledSlot = scheduledSlot;
      if (scheduledStartTime) updateData.scheduledStartTime = scheduledStartTime;
      if (scheduledEndTime) updateData.scheduledEndTime = scheduledEndTime;
    }

    // Cancellation tracking and metadata
    let cancelTrackingItem = null;
    if (targetStatus === 'cancelled') {
      const actorRole = cancelledBy?.role || req.user?.role || 'admin';
      const actorName = cancelledBy?.name || req.user?.fullName || req.user?.name || (actorRole === 'admin' ? 'Admin' : 'Management');
      const reasonVal = cancellationReason || 'Cancelled by administration';
      const notesVal = cancellationNotes || '';

      updateData.cancelledAt = new Date();
      updateData.cancellationReason = reasonVal;
      updateData.cancellationNotes = notesVal;
      updateData.cancelledBy = {
        role: actorRole,
        id: cancelledBy?.id || req.user?._id || req.user?.id || null,
        name: actorName
      };

      const trackingText = `Order cancelled by ${actorRole.toUpperCase()} (${actorName}). Reason: ${reasonVal}${notesVal ? ` - Notes: ${notesVal}` : ''}`;
      cancelTrackingItem = {
        message: trackingText,
        date: new Date(),
        status: 'cancelled'
      };
    }

    if (tracking) {
      const trackingList = (Array.isArray(tracking) ? tracking : [tracking]).map(t => ({
        ...t,
        status: t.status || targetStatus
      }));
      if (cancelTrackingItem && !trackingList.some(t => t.status === 'cancelled' && t.message === cancelTrackingItem.message)) {
        trackingList.unshift(cancelTrackingItem);
      }
      updateData.$push = {
        tracking: {
          $each: trackingList,
          $sort: { date: -1 } // Sort tracking by date descending
        }
      };
    } else if (targetStatus !== existingItem.status || (assignedPartner && assignedPartner.toString() !== existingItem.assignedPartner?.toString())) {
      const defaultItem = cancelTrackingItem || {
        message: assignedPartner ? 'Partner assigned' : `Status updated to ${targetStatus}`,
        date: new Date(),
        status: targetStatus
      };
      updateData.$push = {
        tracking: {
          $each: [defaultItem],
          $sort: { date: -1 }
        }
      };
    }

    const updatedItem = await Cart.findByIdAndUpdate(
      req.params.cartItemId,
      updateData,
      { new: true }
    )
      .populate('assignedPartner', 'fullName contactNumber emergencyContactNumber email expertise').populate('warrantyClaim.assignedPartner', 'fullName contactNumber emergencyContactNumber email expertise')
      .populate('serviceId', 'serviceName serviceCost description');

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
        status: targetStatus || "assigned"
      });

      sendPushToUser(updatedItem.userId, {
        title: "Partner Assigned! ðŸ› ï¸",
        body: "A partner has been assigned to your FixxBuddy service request.",
        data: {
          route: "/orders",
          orderId: String(updatedItem.orderId || updatedItem._id),
          status: targetStatus || "assigned"
        }
      });
      createNotification({
        userId: updatedItem.userId,
        title: "Partner Assigned! ðŸ› ï¸",
        message: `A partner has been assigned to your FixxBuddy service request (${updatedItem.serviceName || updatedItem.orderId || ''}).`,
        type: "partner_assigned",
        link: `/orders?orderId=${updatedItem.orderId || updatedItem._id}`,
        metadata: {
          orderId: String(updatedItem.orderId || updatedItem._id),
          orderDbId: String(updatedItem._id),
          status: targetStatus || "assigned"
        },
        sendPush: false
      }).catch(err => console.warn('Notification error:', err.message));
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

const checkCartServiceability = async (req, res) => {
  try {
    const { pincode, categoryId } = req.query;

    if (!pincode) {
      return res.status(400).json({ success: false, message: 'Pincode is required' });
    }

    // 1. Find active hubs matching pincode
    const hubs = await Hub.find({ pincodes: pincode, isActive: true });
    if (!hubs || hubs.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          serviceable: false,
          message: 'Your selected area is not serviceable.'
        }
      });
    }
    const hubNames = hubs.map(h => h.name);

    // 2. Fetch user's cart items in addToCart status
    let query = { userId: req.user.id, status: 'addToCart' };
    if (categoryId && mongoose.isValidObjectId(categoryId)) {
      query.mainServiceId = categoryId;
    }
    const cartItems = await Cart.find(query);

    if (cartItems.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          serviceable: true,
          message: 'Cart is empty'
        }
      });
    }

    // 3. Verify partner availability for each item
    for (const item of cartItems) {
      const service = await ServiceType.findById(item.serviceId);
      if (!service) {
        return res.status(200).json({
          success: true,
          data: {
            serviceable: false,
            message: `Service not found: ${item.serviceName}`
          }
        });
      }

      const appTypeId = service.applicationTypeId || item.applicationId;
      if (!appTypeId) {
        return res.status(200).json({
          success: true,
          data: {
            serviceable: false,
            message: `Service category mapping is missing for ${item.serviceName}`
          }
        });
      }

      const expertises = await Expertise.find({ "mappedServices.applicationTypeId": appTypeId });
      const matchingExpertiseNames = expertises.map(e => e.name);
      if (matchingExpertiseNames.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            serviceable: false,
            message: `No service partner with matching expertise is available for ${item.serviceName}.`
          }
        });
      }

      const availablePartner = await Partner.findOne({
        isActive: true,
        isDeleted: false,
        hub: { $in: hubNames },
        $or: [
          { expertise: { $in: matchingExpertiseNames } },
          { designation: { $in: matchingExpertiseNames } }
        ]
      });

      if (!availablePartner) {
        return res.status(200).json({
          success: true,
          data: {
            serviceable: false,
            message: `Currently no service partner with the required expertise is available in your area for ${item.serviceName}.`
          }
        });
      }
    }

    // If all checks pass
    return res.status(200).json({
      success: true,
      data: {
        serviceable: true,
        message: 'All items are serviceable'
      }
    });

  } catch (error) {
    console.error('Error checking cart serviceability:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// @desc    Rate service and partner for completed order (prevents duplicate ratings per booking)
// @route   POST /api/cart/:cartItemId/rate
// @access  Private
const ratePartner = async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const {
      serviceRating,
      serviceFeedback,
      partnerRating,
      partnerFeedback,
      rating,
      feedback
    } = req.body;

    const numServiceRating = serviceRating ? Number(serviceRating) : null;
    const numPartnerRating = partnerRating ? Number(partnerRating) : (rating ? Number(rating) : null);

    if (!numServiceRating && !numPartnerRating) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a rating (1 to 5 stars) for either the service or partner'
      });
    }

    if (numServiceRating && (numServiceRating < 1 || numServiceRating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Service rating must be a number between 1 and 5'
      });
    }

    if (numPartnerRating && (numPartnerRating < 1 || numPartnerRating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Partner rating must be a number between 1 and 5'
      });
    }

    const userId = req.user.id || req.user._id;

    // Find cart item
    const cartItem = await Cart.findOne({
      _id: cartItemId,
      userId: userId
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Order item not found'
      });
    }

    if (cartItem.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Rating is only allowed for completed services'
      });
    }

    // Fetch user details for display name
    const User = require('../models/user.model');
    const userDoc = await User.findById(userId);
    const userName = userDoc ? `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() : 'Customer';

    const serviceFeedbackText = serviceFeedback !== undefined ? String(serviceFeedback).trim() : (feedback !== undefined ? String(feedback).trim() : '');
    const partnerFeedbackText = partnerFeedback !== undefined ? String(partnerFeedback).trim() : (feedback !== undefined ? String(feedback).trim() : '');

    let serviceAverageRating = null;
    let serviceTotalRatings = null;
    let partnerAverageRating = null;
    let partnerTotalRatings = null;

    // 1. Process Service Rating
    if (numServiceRating && cartItem.serviceId) {
      const ServiceType = require('../models/serviceType.model');
      const service = await ServiceType.findById(cartItem.serviceId);
      if (service) {
        if (!Array.isArray(service.ratings)) {
          service.ratings = [];
        }

        // Prevent multiple reviews for a single booking: match by cartId
        const existingServiceRatingIndex = service.ratings.findIndex(
          r => r.cartId && r.cartId.toString() === cartItemId
        );

        if (existingServiceRatingIndex >= 0) {
          service.ratings[existingServiceRatingIndex].rating = numServiceRating;
          service.ratings[existingServiceRatingIndex].feedback = serviceFeedbackText;
          service.ratings[existingServiceRatingIndex].userName = userName;
          service.ratings[existingServiceRatingIndex].createdAt = new Date();
        } else {
          service.ratings.push({
            cartId: cartItem._id,
            orderId: cartItem.orderId || '',
            userId: userId,
            userName: userName,
            rating: numServiceRating,
            feedback: serviceFeedbackText,
            createdAt: new Date()
          });
        }

        const sTotal = service.ratings.length;
        const sSum = service.ratings.reduce((acc, curr) => acc + curr.rating, 0);
        service.totalRatings = sTotal;
        service.averageRating = sTotal > 0 ? Number((sSum / sTotal).toFixed(1)) : 0;
        await ServiceType.findByIdAndUpdate(
          service._id,
          {
            $set: {
              ratings: service.ratings,
              totalRatings: service.totalRatings,
              averageRating: service.averageRating
            }
          },
          { runValidators: false }
        );

        serviceAverageRating = service.averageRating;
        serviceTotalRatings = service.totalRatings;
      }
    }

    // 2. Process Partner Rating
    if (numPartnerRating && cartItem.assignedPartner) {
      const partner = await Partner.findById(cartItem.assignedPartner);
      if (partner) {
        if (!Array.isArray(partner.ratings)) {
          partner.ratings = [];
        }

        // Prevent multiple reviews for a single booking: match by cartId
        const existingPartnerRatingIndex = partner.ratings.findIndex(
          r => r.cartId && r.cartId.toString() === cartItemId
        );

        if (existingPartnerRatingIndex >= 0) {
          partner.ratings[existingPartnerRatingIndex].rating = numPartnerRating;
          partner.ratings[existingPartnerRatingIndex].feedback = partnerFeedbackText;
          partner.ratings[existingPartnerRatingIndex].userName = userName;
          partner.ratings[existingPartnerRatingIndex].createdAt = new Date();
        } else {
          partner.ratings.push({
            cartId: cartItem._id,
            orderId: cartItem.orderId || '',
            userId: userId,
            userName: userName,
            rating: numPartnerRating,
            feedback: partnerFeedbackText,
            createdAt: new Date()
          });
        }

        const pTotal = partner.ratings.length;
        const pSum = partner.ratings.reduce((acc, curr) => acc + curr.rating, 0);
        partner.totalRatings = pTotal;
        partner.averageRating = pTotal > 0 ? Number((pSum / pTotal).toFixed(1)) : 0;
        await Partner.findByIdAndUpdate(
          partner._id,
          {
            $set: {
              ratings: partner.ratings,
              totalRatings: partner.totalRatings,
              averageRating: partner.averageRating,
              ...(partner.role ? { role: String(partner.role).toUpperCase() } : {})
            }
          },
          { runValidators: false }
        );

        partnerAverageRating = partner.averageRating;
        partnerTotalRatings = partner.totalRatings;
      }
    }

    // 3. Update Cart Item
    if (numServiceRating) {
      cartItem.serviceRating = numServiceRating;
      cartItem.serviceFeedback = serviceFeedbackText;
    }
    if (numPartnerRating) {
      cartItem.partnerRating = numPartnerRating;
      cartItem.partnerFeedback = partnerFeedbackText;
    }
    cartItem.rating = numPartnerRating || numServiceRating || cartItem.rating;
    cartItem.ratingFeedback = partnerFeedbackText || serviceFeedbackText || cartItem.ratingFeedback;
    cartItem.isRated = true;
    cartItem.ratedAt = new Date();
    await Cart.findByIdAndUpdate(
      cartItem._id,
      {
        $set: {
          serviceRating: cartItem.serviceRating,
          serviceFeedback: cartItem.serviceFeedback,
          partnerRating: cartItem.partnerRating,
          partnerFeedback: cartItem.partnerFeedback,
          rating: cartItem.rating,
          ratingFeedback: cartItem.ratingFeedback,
          isRated: true,
          ratedAt: cartItem.ratedAt
        }
      },
      { runValidators: false }
    );

    res.status(200).json({
      success: true,
      message: 'Rating and feedback submitted successfully',
      data: {
        cartItem,
        serviceAverageRating,
        serviceTotalRatings,
        partnerAverageRating,
        partnerTotalRatings
      }
    });
  } catch (error) {
    console.error('Error rating order:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rating order',
      error: error.message
    });
  }
};

// @desc    Reschedule customer order slot
// @route   PATCH /api/cart/reschedule/:cartItemId
// @access  Private (Customer)
const customerRescheduleSlot = async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const { scheduledDate, scheduledStartTime, scheduledEndTime, scheduledSlot } = req.body;

    if (!scheduledDate || !scheduledStartTime || !scheduledEndTime) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled date, start time, and end time are required'
      });
    }

    const order = await Cart.findOne({
      _id: cartItemId,
      userId: req.user.id
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot reschedule: Order is already ${order.status}`
      });
    }

    // Check that current time is at least 1 hour BEFORE the currently scheduled visit
    if (order.scheduledDate) {
      const currentVisitTime = new Date(order.scheduledDate);
      if (order.scheduledStartTime) {
        const [h, m] = order.scheduledStartTime.split(':').map(Number);
        if (!isNaN(h)) {
          currentVisitTime.setHours(h, m || 0, 0, 0);
        }
      }
      const diffMs = currentVisitTime.getTime() - Date.now();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Slots can only be rescheduled at least 1 hour prior to your currently scheduled visit time.'
        });
      }
    }

    // Validate new slot is at least 1 hour in the future
    const newDateObj = new Date(scheduledDate);
    const [newStartHour, newStartMin] = scheduledStartTime.split(':').map(Number);
    newDateObj.setHours(newStartHour, newStartMin || 0, 0, 0);

    if (newDateObj.getTime() - Date.now() < 60 * 60 * 1000) {
      return res.status(400).json({
        success: false,
        message: 'New slot must be at least 1 hour in advance from the current time.'
      });
    }

    // Rule: "not before slot only after slot they can select"
    // If selecting on the same day as current scheduled date:
    if (order.scheduledDate) {
      const currD = new Date(order.scheduledDate).toISOString().slice(0, 10);
      const newD = new Date(scheduledDate).toISOString().slice(0, 10);
      if (currD === newD && order.scheduledStartTime) {
        if (scheduledStartTime <= order.scheduledStartTime) {
          return res.status(400).json({
            success: false,
            message: 'For the same date, you can only select a slot after your currently assigned slot.'
          });
        }
      }
    }

    const slotLabel = scheduledSlot || `${scheduledStartTime} - ${scheduledEndTime}`;
    const formattedDate = new Date(scheduledDate).toLocaleDateString();

    order.scheduledDate = new Date(scheduledDate);
    order.scheduledStartTime = scheduledStartTime;
    order.scheduledEndTime = scheduledEndTime;
    order.scheduledSlot = slotLabel;
    order.rescheduledAt = new Date();
    order.isRescheduled = true;

    order.tracking.push({
      status: order.status || 'inProgress',
      message: `Service slot rescheduled by customer to ${formattedDate} (${slotLabel}).`,
      date: new Date()
    });

    await order.save();

    // Notify Admin Portal of Reschedule via Ably
    try {
      ably.channels.get('admin-channel').publish('task_updated', {
        type: 'job_rescheduled',
        orderId: order.orderId || order._id,
        scheduledDate: order.scheduledDate,
        scheduledSlot: slotLabel,
        isRescheduled: true,
        rescheduledAt: order.rescheduledAt,
        message: `Order #${order.orderId || order._id} was rescheduled by customer to ${formattedDate} (${slotLabel}).`
      });
      ably.channels.get('admin-channel').publish('job_rescheduled', {
        orderId: order.orderId || order._id,
        scheduledDate: order.scheduledDate,
        scheduledSlot: slotLabel,
        isRescheduled: true,
        rescheduledAt: order.rescheduledAt,
        message: `Order #${order.orderId || order._id} was rescheduled by customer to ${formattedDate} (${slotLabel}).`
      });
    } catch (adminAblyErr) {
      console.warn('Ably notify admin error:', adminAblyErr);
    }

    // Notify assigned partner if any
    if (order.assignedPartner) {
      try {
        ably.channels.get(`partner-${order.assignedPartner}`).publish('task_rescheduled', {
          orderId: order.orderId || order._id,
          scheduledDate: order.scheduledDate,
          scheduledSlot: slotLabel,
          message: `Order #${order.orderId || order._id} was rescheduled by customer to ${formattedDate} (${slotLabel}).`
        });
      } catch (err) {
        console.warn('Ably notify partner error:', err);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Service slot rescheduled successfully',
      data: order
    });
  } catch (error) {
    console.error('Error in customerRescheduleSlot:', error);
    res.status(500).json({ success: false, message: 'Server error rescheduling slot' });
  }
};


// ==========================================
// Warranty Claim Handlers
// ==========================================

// @desc    Customer submits a warranty claim for a completed order
// @route   POST /api/cart/claim-warranty/:cartItemId
// @access  Private/Customer
const customerClaimWarranty = async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const { reason, notes, preferredDate, preferredSlot } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reason for warranty claim is required'
      });
    }

    const cartItem = await Cart.findOne({
      _id: cartItemId,
      userId: req.user.id
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (cartItem.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Warranty claims are only available for completed services'
      });
    }

    const warrantyDuration = (cartItem.warrantyMonths !== undefined && cartItem.warrantyMonths !== null)
      ? Number(cartItem.warrantyMonths)
      : 3;

    if (warrantyDuration <= 0 || cartItem.warrantyClaim?.status === 'not_applicable') {
      return res.status(400).json({
        success: false,
        message: 'Warranty coverage is not applicable for this service.'
      });
    }

    // Check warranty expiration
    const expiryDate = cartItem.warrantyExpiresAt || (cartItem.completedAt ? new Date(cartItem.completedAt.getTime() + warrantyDuration * 30 * 24 * 60 * 60 * 1000) : null);
    if (expiryDate && new Date() > expiryDate) {
      return res.status(400).json({
        success: false,
        message: `Warranty period expired on ${expiryDate.toLocaleDateString('en-IN')}. Warranty claim cannot be submitted.`
      });
    }

    // Check if active claim is already pending/assigned/inProgress
    if (cartItem.warrantyClaim?.claimed && ['pending', 'approved', 'assigned', 'inProgress'].includes(cartItem.warrantyClaim.status)) {
      return res.status(400).json({
        success: false,
        message: 'A warranty claim is already in progress for this service booking.'
      });
    }

    const claimId = `WC-${Date.now().toString().slice(-6)}`;
    cartItem.warrantyClaim = {
      claimed: true,
      claimId,
      reason: reason.trim(),
      notes: notes ? notes.trim() : '',
      status: 'pending',
      claimedAt: new Date(),
      scheduledDate: preferredDate ? new Date(preferredDate) : null,
      scheduledSlot: preferredSlot || '',
      assignedPartner: null,
      rejectionReason: '',
      resolutionNotes: '',
      resolvedAt: null
    };

    const trackingMsg = `Warranty claim submitted (${claimId}): ${reason.trim()}`;
    cartItem.tracking.unshift({
      message: trackingMsg,
      date: new Date(),
      status: 'warrantyClaim'
    });

    await cartItem.save();

    // Real-time notification via Ably
    try {
      const channel = ably.channels.get('admin-notifications');
      channel.publish('warranty_claim_submitted', {
        cartItemId: cartItem._id,
        orderId: cartItem.orderId,
        serviceName: cartItem.serviceName,
        claimId,
        customerName: req.user.fullName || req.user.name,
        reason: reason.trim()
      });
    } catch (e) {
      console.warn('Ably notification error (warranty claim):', e.message);
    }

    res.status(200).json({
      success: true,
      message: 'Warranty claim submitted successfully. Our team will review and assign a technician shortly.',
      data: cartItem
    });
  } catch (error) {
    console.error('Error submitting warranty claim:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit warranty claim',
      error: error.message
    });
  }
};

// @desc    Admin/Staff manage or reassign partner for warranty claim
// @route   PATCH /api/cart/admin/warranty-claim/:cartItemId
// @access  Private/Admin
const adminWarrantyClaimAction = async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const {
      action,
      assignedPartner,
      scheduledDate,
      scheduledStartTime,
      scheduledEndTime,
      scheduledSlot,
      status,
      reason,
      notes,
      rejectionReason,
      notApplicableReason,
      resolutionNotes
    } = req.body;

    const cartItem = await Cart.findById(cartItemId)
      .populate('userId', 'fullName firstName lastName email contactNumbers phone');

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Service order not found'
      });
    }

    // Allow creating/opening claim on behalf of user if not claimed yet
    if (action === 'open_claim' || action === 'create_claim') {
      const claimId = `WC-${Date.now().toString().slice(-6)}`;
      cartItem.warrantyClaim = {
        claimed: true,
        claimId,
        reason: (reason || 'Warranty claim registered by staff').trim(),
        notes: (notes || '').trim(),
        status: status || 'pending',
        claimedAt: new Date(),
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        scheduledSlot: scheduledSlot || '',
        scheduledStartTime: scheduledStartTime || '',
        scheduledEndTime: scheduledEndTime || '',
        assignedPartner: assignedPartner || null,
        rejectionReason: status === 'rejected' ? ((rejectionReason || reason || notes || '').trim()) : '',
        resolutionNotes: status === 'completed' ? ((resolutionNotes || notes || reason || '').trim()) : '',
        notApplicableReason: status === 'not_applicable' ? ((notApplicableReason || reason || notes || 'Deemed not applicable by staff').trim()) : '',
        resolvedAt: status === 'completed' ? new Date() : null
      };

      cartItem.tracking.unshift({
        message: `Warranty claim opened by Staff (${claimId}): ${cartItem.warrantyClaim.reason}${status === 'not_applicable' ? ' [Marked Not Applicable]' : ''}`,
        date: new Date(),
        status: status === 'not_applicable' ? 'warrantyNotApplicable' : 'warrantyClaim'
      });

      await cartItem.save();
      return res.status(200).json({
        success: true,
        message: 'Warranty claim opened successfully',
        data: cartItem
      });
    }

    if (!cartItem.warrantyClaim) {
      cartItem.warrantyClaim = {
        claimed: true,
        claimId: `WC-${Date.now().toString().slice(-6)}`,
        status: status || 'pending',
        reason: (reason || 'Warranty claim registered by staff').trim()
      };
    } else if (!cartItem.warrantyClaim.claimed) {
      cartItem.warrantyClaim.claimed = true;
      if (!cartItem.warrantyClaim.claimId) {
        cartItem.warrantyClaim.claimId = `WC-${Date.now().toString().slice(-6)}`;
      }
    }


    // Admin / Manager process or approve customer refund
    if (action === 'approve_refund' || action === 'process_refund') {
      cartItem.warrantyClaim.refundStatus = 'approved';
      cartItem.warrantyClaim.refundProcessedAt = new Date();
      cartItem.warrantyClaim.status = 'refunded';
      cartItem.status = 'refunded';

      const approvedRefundAmt = cartItem.warrantyClaim.refundAmount || cartItem.finalAmount || cartItem.serviceCost || 0;
      cartItem.tracking.unshift({
        message: `Customer refund of ₹${approvedRefundAmt} approved and processed by Management.${notes ? ` Notes: ${notes}` : ''}`,
        date: new Date(),
        status: 'warrantyRefundApproved'
      });

      await cartItem.save();

      try {
        ably.channels.get("admin-channel").publish("task_updated", {
          message: `Refund of ₹${approvedRefundAmt} approved for Order #${cartItem.orderId}`,
          taskId: cartItem._id,
          orderId: cartItem.orderId,
          status: 'refunded'
        });
        ably.channels.get("admin-channel").publish("warranty_claim_updated", {
          taskId: cartItem._id,
          orderId: cartItem.orderId,
          status: 'refunded'
        });
      } catch (e) {
        console.warn('Ably error:', e.message);
      }

      return res.status(200).json({
        success: true,
        message: `Customer refund of ₹${approvedRefundAmt} approved and marked as processed`,
        data: cartItem
      });
    }

    if (action === 'reject_refund') {
      cartItem.warrantyClaim.refundStatus = 'rejected';
      cartItem.warrantyClaim.status = 'inProgress';

      const rejectReason = (reason || notes || 'Refund request rejected by Management').trim();
      cartItem.tracking.unshift({
        message: `Warranty refund request rejected by Management: ${rejectReason}. Assigned for repair inspection.`,
        date: new Date(),
        status: 'warrantyRefundRejected'
      });

      await cartItem.save();

      try {
        ably.channels.get("admin-channel").publish("task_updated", {
          message: `Refund rejected for Order #${cartItem.orderId}`,
          taskId: cartItem._id,
          orderId: cartItem.orderId,
          status: 'inProgress'
        });
        ably.channels.get("admin-channel").publish("warranty_claim_updated", {
          taskId: cartItem._id,
          orderId: cartItem.orderId,
          status: 'inProgress'
        });
      } catch (e) {
        console.warn('Ably error:', e.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Warranty refund request rejected',
        data: cartItem
      });
    }

    if (action === 'revoke_claim' || action === 'reset_claim') {
      cartItem.warrantyClaim = {
        claimed: false,
        claimId: '',
        reason: '',
        notes: '',
        status: 'none',
        claimedAt: null,
        assignedPartner: null,
        scheduledDate: null,
        scheduledStartTime: '',
        scheduledEndTime: '',
        scheduledSlot: '',
        resolvedAt: null,
        resolutionNotes: '',
        rejectionReason: '',
        notApplicableReason: ''
      };

      cartItem.tracking.unshift({
        message: `Warranty claim cleared / revoked by Staff`,
        date: new Date(),
        status: 'warrantyRevoked'
      });

      await cartItem.save();
      return res.status(200).json({
        success: true,
        message: 'Warranty claim has been cleared / revoked',
        data: cartItem
      });
    }

    if (action === 'assign_partner' || action === 'reassign') {
      if (!assignedPartner) {
        return res.status(400).json({
          success: false,
          message: 'Partner ID is required for assignment'
        });
      }

      const Partner = require('../models/partner.model');
      const partnerObj = await Partner.findById(assignedPartner);
      if (!partnerObj) {
        return res.status(404).json({
          success: false,
          message: 'Partner not found'
        });
      }

      cartItem.warrantyClaim.assignedPartner = assignedPartner;
      cartItem.warrantyClaim.status = 'assigned';
      if (scheduledDate) cartItem.warrantyClaim.scheduledDate = new Date(scheduledDate);
      if (scheduledStartTime) cartItem.warrantyClaim.scheduledStartTime = scheduledStartTime;
      if (scheduledEndTime) cartItem.warrantyClaim.scheduledEndTime = scheduledEndTime;
      if (scheduledSlot) cartItem.warrantyClaim.scheduledSlot = scheduledSlot;

      const partnerName = partnerObj.fullName || `${partnerObj.firstName || ''} ${partnerObj.lastName || ''}`.trim();
      const dateStr = scheduledDate ? new Date(scheduledDate).toLocaleDateString('en-IN') : '';
      const trackingMsg = `Warranty claim visit assigned to Partner ${partnerName}${dateStr ? ` for ${dateStr}` : ''}${scheduledSlot ? ` (${scheduledSlot})` : ''}`;

      cartItem.tracking.unshift({
        message: trackingMsg,
        date: new Date(),
        status: 'warrantyAssigned'
      });

      await cartItem.save();

      // Notify partner via Ably
      try {
        const partnerChannel = ably.channels.get(`partner-${assignedPartner}`);
        partnerChannel.publish('warranty_claim_assigned', {
          taskId: cartItem._id,
          orderId: cartItem.orderId,
          serviceName: cartItem.serviceName,
          claimId: cartItem.warrantyClaim.claimId,
          reason: cartItem.warrantyClaim.reason,
          scheduledDate: cartItem.warrantyClaim.scheduledDate,
          scheduledSlot: cartItem.warrantyClaim.scheduledSlot
        });
      } catch (e) {
        console.warn('Ably partner notification error:', e.message);
      }

      return res.status(200).json({
        success: true,
        message: `Partner ${partnerName} assigned for warranty claim service visit`,
        data: cartItem
      });
    }

    // Dedicated handler for editing claim details without forcing status transitions
    if (action === 'edit_claim') {
      if (reason !== undefined) cartItem.warrantyClaim.reason = (reason || '').trim();
      if (notes !== undefined) cartItem.warrantyClaim.notes = (notes || '').trim();
      if (rejectionReason !== undefined) cartItem.warrantyClaim.rejectionReason = (rejectionReason || '').trim();
      if (notApplicableReason !== undefined) cartItem.warrantyClaim.notApplicableReason = (notApplicableReason || '').trim();
      if (resolutionNotes !== undefined) cartItem.warrantyClaim.resolutionNotes = (resolutionNotes || '').trim();
      if (status && status !== 'none') cartItem.warrantyClaim.status = status;

      cartItem.tracking.unshift({
        message: `Warranty claim details updated by staff${notes ? `: ${notes}` : ''}`,
        date: new Date(),
        status: 'warrantyClaimEdited'
      });

      await cartItem.save();

      try {
        ably.channels.get("admin-channel").publish("warranty_claim_updated", {
          taskId: cartItem._id,
          orderId: cartItem.orderId,
          status: cartItem.warrantyClaim.status,
          claimId: cartItem.warrantyClaim.claimId
        });

        const userChannelId = cartItem.userId?._id ? cartItem.userId._id.toString() : (cartItem.userId ? cartItem.userId.toString() : null);
        if (userChannelId) {
          ably.channels.get(`user-${userChannelId}`).publish("order_status_updated", {
            orderId: cartItem.orderId || cartItem._id,
            claimId: cartItem.warrantyClaim.claimId,
            message: 'Warranty claim details updated by support.'
          });
        }
      } catch (e) {
        console.warn('Ably notify error:', e.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Warranty claim details updated successfully',
        data: cartItem
      });
    }

    if (action === 'update_status') {
      const validStatuses = ['pending', 'approved', 'assigned', 'inProgress', 'completed', 'rejected', 'not_applicable', 'cancelled', 'refund_initiated', 'refunded'];
      const targetClaimStatus = status || cartItem.warrantyClaim.status;
      
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid warranty claim status. Allowed: ${validStatuses.join(', ')}`
        });
      }

      if (status) cartItem.warrantyClaim.status = status;
      if (reason) cartItem.warrantyClaim.reason = reason.trim();
      if (notes) cartItem.warrantyClaim.notes = notes.trim();

      if (assignedPartner !== undefined) {
        cartItem.warrantyClaim.assignedPartner = assignedPartner || null;
      }
      if (scheduledDate !== undefined) {
        cartItem.warrantyClaim.scheduledDate = scheduledDate ? new Date(scheduledDate) : null;
      }
      if (scheduledSlot !== undefined) cartItem.warrantyClaim.scheduledSlot = scheduledSlot;
      if (scheduledStartTime !== undefined) cartItem.warrantyClaim.scheduledStartTime = scheduledStartTime;
      if (scheduledEndTime !== undefined) cartItem.warrantyClaim.scheduledEndTime = scheduledEndTime;

      if (targetClaimStatus === 'completed') {
        const finalResNotes = (resolutionNotes || notes || reason || 'Warranty service issue resolved').trim();
        cartItem.warrantyClaim.resolvedAt = new Date();
        cartItem.warrantyClaim.resolutionNotes = finalResNotes;
        cartItem.tracking.unshift({
          message: `Warranty claim resolved successfully: ${finalResNotes}`,
          date: new Date(),
          status: 'warrantyResolved'
        });
      } else if (targetClaimStatus === 'rejected') {
        const finalRejectionReason = (rejectionReason || reason || notes || 'Warranty claim rejected by management').trim();
        cartItem.warrantyClaim.rejectionReason = finalRejectionReason;
        cartItem.tracking.unshift({
          message: `Warranty claim rejected: ${finalRejectionReason}`,
          date: new Date(),
          status: 'warrantyRejected'
        });
      } else if (targetClaimStatus === 'not_applicable') {
        const naReason = (notApplicableReason || reason || notes || 'Issue outside warranty scope / Not applicable').trim();
        cartItem.warrantyClaim.notApplicableReason = naReason;
        cartItem.warrantyClaim.rejectionReason = naReason;
        cartItem.tracking.unshift({
          message: `Warranty claim marked as Not Applicable: ${naReason}`,
          date: new Date(),
          status: 'warrantyNotApplicable'
        });
      } else {
        cartItem.tracking.unshift({
          message: `Warranty claim status updated to ${targetClaimStatus}${notes ? `: ${notes}` : ''}`,
          date: new Date(),
          status: `warranty_${targetClaimStatus}`
        });
      }

      await cartItem.save();

      // Notify Ably admin and customer
      try {
        ably.channels.get("admin-channel").publish("warranty_claim_updated", {
          taskId: cartItem._id,
          orderId: cartItem.orderId,
          status: targetClaimStatus,
          claimId: cartItem.warrantyClaim.claimId,
          rejectionReason: cartItem.warrantyClaim.rejectionReason,
          notApplicableReason: cartItem.warrantyClaim.notApplicableReason
        });
        ably.channels.get("admin-channel").publish("task_updated", {
          message: `Warranty claim status: ${targetClaimStatus}`,
          taskId: cartItem._id,
          orderId: cartItem.orderId,
          status: targetClaimStatus
        });

        const userChannelId = cartItem.userId?._id ? cartItem.userId._id.toString() : (cartItem.userId ? cartItem.userId.toString() : null);
        if (userChannelId) {
          const userMsg = targetClaimStatus === 'rejected'
            ? `Warranty claim rejected: ${cartItem.warrantyClaim.rejectionReason}`
            : targetClaimStatus === 'not_applicable'
            ? `Warranty claim not applicable: ${cartItem.warrantyClaim.notApplicableReason}`
            : `Warranty claim status updated to ${targetClaimStatus}`;

          ably.channels.get(`user-${userChannelId}`).publish("order_status_updated", {
            orderId: cartItem.orderId || cartItem._id,
            claimId: cartItem.warrantyClaim.claimId,
            status: targetClaimStatus,
            rejectionReason: cartItem.warrantyClaim.rejectionReason,
            notApplicableReason: cartItem.warrantyClaim.notApplicableReason,
            message: userMsg
          });
        }
      } catch (e) {
        console.warn('Ably notification error:', e.message);
      }

      return res.status(200).json({
        success: true,
        message: `Warranty claim updated (Status: ${targetClaimStatus})`,
        data: cartItem
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action specified. Supported actions: open_claim, assign_partner, reassign, update_status, edit_claim, revoke_claim'
    });
  } catch (error) {
    console.error('Error managing warranty claim:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update warranty claim',
      error: error.message
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
  getOrderDetails,
  getOrderInvoice,
  adminUpdateCartItemStatus,
  checkCartServiceability,
  ratePartner,
  customerRescheduleSlot,
  customerClaimWarranty,
  adminWarrantyClaimAction,
};
