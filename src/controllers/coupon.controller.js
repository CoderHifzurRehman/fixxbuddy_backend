const Coupon = require('../models/coupon.model');
const ServiceType = require('../models/serviceType.model');
const ApplicationType = require('../models/applicationType.model');

// Create a new coupon
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountPercentage,
      maxDiscountAmount,
      validFrom,
      validUntil,
      applicableTo,
    } = req.body;

    // Check if coupon with same code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).send({
        statusCode: 400,
        message: 'Coupon code already exists.',
      });
    }

    const newCoupon = new Coupon({
      code,
      discountPercentage,
      maxDiscountAmount,
      validFrom,
      validUntil,
      applicableTo,
    });

    const savedCoupon = await newCoupon.save();

    res.status(201).send({
      statusCode: 201,
      message: 'Coupon created successfully.',
      data: savedCoupon,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || 'Some error occurred while creating the coupon.',
    });
  }
};

// Get all coupons
exports.getAllCoupons = async (req, res) => {
  try {
    const { isActive } = req.query;
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const coupons = await Coupon.find(query)
      .sort({ createdAt: -1 })
      .populate('applicableTo.applicationTypeId', 'serviceName')
      .populate('applicableTo.serviceTypeIds', 'serviceName');

    res.status(200).send({
      statusCode: 200,
      message: 'Coupons retrieved successfully.',
      data: coupons,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || 'Some error occurred while retrieving coupons.',
    });
  }
};

// Get coupon by ID
exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('applicableTo.applicationTypeId', 'serviceName')
      .populate('applicableTo.serviceTypeIds', 'serviceName');

    if (!coupon) {
      return res.status(404).send({
        statusCode: 404,
        message: 'Coupon not found.',
      });
    }

    res.status(200).send({
      statusCode: 200,
      message: 'Coupon retrieved successfully.',
      data: coupon,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || 'Error retrieving coupon.',
    });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const {
      discountPercentage,
      maxDiscountAmount,
      validFrom,
      validUntil,
      isActive,
      applicableTo,
    } = req.body;

    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).send({
        statusCode: 404,
        message: 'Coupon not found.',
      });
    }

    // Update fields (prevent updating code for simplicity/integrity)
    if (discountPercentage !== undefined) coupon.discountPercentage = discountPercentage;
    if (maxDiscountAmount !== undefined) coupon.maxDiscountAmount = maxDiscountAmount;
    if (validFrom !== undefined) coupon.validFrom = validFrom;
    if (validUntil !== undefined) coupon.validUntil = validUntil;
    if (isActive !== undefined) coupon.isActive = isActive;
    if (applicableTo !== undefined) coupon.applicableTo = applicableTo;

    const updatedCoupon = await coupon.save();

    res.status(200).send({
      statusCode: 200,
      message: 'Coupon updated successfully.',
      data: updatedCoupon,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || 'Error updating coupon.',
    });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);

    if (!coupon) {
      return res.status(404).send({
        statusCode: 404,
        message: 'Coupon not found.',
      });
    }

    res.status(200).send({
      statusCode: 200,
      message: 'Coupon deleted successfully.',
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || 'Could not delete coupon.',
    });
  }
};

// Validate Coupon (Public Endpoint)
exports.validateCoupon = async (req, res) => {
  try {
    const { code, cartItems } = req.body; // cartItems should be an array of serviceType IDs

    if (!code || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).send({
        statusCode: 400,
        message: 'Invalid input. Code and cartItems (array) are required.',
      });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      return res.status(404).send({
        statusCode: 404,
        message: 'Invalid coupon code.',
      });
    }

    if (!coupon.isValid()) {
      return res.status(400).send({
        statusCode: 400,
        message: 'Coupon is inactive or expired.',
      });
    }

    // Find services in cart to check applicability
    const services = await ServiceType.find({ _id: { $in: cartItems } });

    if (services.length === 0) {
      return res.status(400).send({
         statusCode: 400,
         message: "No valid services found in cart."
      })
    }
    
    let applicableServiceIds = [];
    let totalDiscountAmount = 0;

    // Check each service against coupon rules
    for (const service of services) {
        let isApplicable = false;

        // Check against each rule in applicableTo
        for (const rule of coupon.applicableTo) {
            // Check if service belongs to the application type matches
            if (service.applicationTypeId.toString() === rule.applicationTypeId.toString()) {
                
                // If serviceTypeIds is empty, it applies to ALL services in this app type
                if (rule.serviceTypeIds.length === 0) {
                    isApplicable = true;
                } else {
                     // Otherwise check if specific service ID is included
                    if (rule.serviceTypeIds.map(id => id.toString()).includes(service._id.toString())) {
                        isApplicable = true;
                    }
                }
            }
            if (isApplicable) break; // Found a matching rule
        }

        if (isApplicable) {
            applicableServiceIds.push(service._id);
        }
    }

    if (applicableServiceIds.length === 0) {
         return res.status(400).send({
            statusCode: 400,
            message: 'Coupon is not applicable to any items in your cart.',
          });
    }

    // You might want to calculate exact discount numbers here if needed,
    // but typically frontend just needs to know it's valid and the %/max details.
    // However, if we want to be helpful, we can say "applies to X items".

    res.status(200).send({
      statusCode: 200,
      message: 'Coupon applied successfully.',
      data: {
        couponCode: coupon.code,
        discountPercentage: coupon.discountPercentage,
        maxDiscountAmount: coupon.maxDiscountAmount,
        applicableServiceIds: applicableServiceIds
      },
    });

  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || 'Error validating coupon.',
    });
  }
};


// Get Available Coupons for Customer Cart (Public)
exports.getAvailableCoupons = async (req, res) => {
  try {
    const now = new Date();
    const rawCartItems = req.body?.cartItems || req.query?.cartItems || [];
    
    let serviceIds = [];
    if (Array.isArray(rawCartItems)) {
      serviceIds = rawCartItems.map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && item.serviceId) return typeof item.serviceId === 'string' ? item.serviceId : item.serviceId._id;
        if (item && item._id) return item._id;
        return item;
      }).filter(Boolean);
    } else if (typeof rawCartItems === 'string' && rawCartItems.trim()) {
      serviceIds = rawCartItems.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Query active and valid coupons
    const coupons = await Coupon.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now }
    })
    .populate('applicableTo.applicationTypeId', 'serviceName categoryName')
    .populate('applicableTo.serviceTypeIds', 'serviceName serviceCost')
    .sort({ discountPercentage: -1 });

    let servicesInCart = [];
    if (serviceIds.length > 0) {
      servicesInCart = await ServiceType.find({ _id: { $in: serviceIds } }).populate('applicationTypeId', 'serviceName');
    }

    const availableCoupons = coupons.map(coupon => {
      let isApplicable = false;
      let applicableItemsCount = 0;
      let matchingServiceNames = [];

      if (servicesInCart.length > 0) {
        for (const service of servicesInCart) {
          let serviceMatches = false;
          if (!coupon.applicableTo || coupon.applicableTo.length === 0) {
            serviceMatches = true;
          } else {
            for (const rule of coupon.applicableTo) {
              const ruleAppId = rule.applicationTypeId?._id?.toString() || rule.applicationTypeId?.toString();
              const serviceAppId = service.applicationTypeId?._id?.toString() || service.applicationTypeId?.toString();

              if (ruleAppId && serviceAppId && ruleAppId === serviceAppId) {
                if (!rule.serviceTypeIds || rule.serviceTypeIds.length === 0) {
                  serviceMatches = true;
                } else {
                  const ruleServiceIds = rule.serviceTypeIds.map(st => (st._id || st).toString());
                  if (ruleServiceIds.includes(service._id.toString())) {
                    serviceMatches = true;
                  }
                }
              }
              if (serviceMatches) break;
            }
          }

          if (serviceMatches) {
            applicableItemsCount++;
            matchingServiceNames.push(service.serviceName);
          }
        }
        isApplicable = applicableItemsCount > 0;
      } else {
        // If cart is empty, all valid coupons are considered generally available
        isApplicable = true;
      }

      // Readable category scope
      let scopeText = 'All Home Services';
      if (coupon.applicableTo && coupon.applicableTo.length > 0) {
        const catNames = coupon.applicableTo
          .map(r => r.applicationTypeId?.serviceName || r.applicationTypeId?.categoryName)
          .filter(Boolean);
        const uniqueCats = [...new Set(catNames)];
        if (uniqueCats.length === 1) {
          scopeText = `${uniqueCats[0]} Services`;
        } else if (uniqueCats.length > 1 && uniqueCats.length <= 3) {
          scopeText = uniqueCats.join(', ');
        } else if (uniqueCats.length > 3) {
          scopeText = `${uniqueCats.slice(0, 2).join(', ')} & more`;
        }
      }

      const discountSummary = coupon.maxDiscountAmount 
        ? `${coupon.discountPercentage}% OFF up to ₹${coupon.maxDiscountAmount}` 
        : `${coupon.discountPercentage}% OFF`;

      return {
        _id: coupon._id,
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
        maxDiscountAmount: coupon.maxDiscountAmount,
        discountSummary,
        validUntil: coupon.validUntil,
        scopeText,
        isApplicable,
        matchingServiceNames: [...new Set(matchingServiceNames)]
      };
    });

    // Sort: applicable coupons first, then by discount percentage descending
    availableCoupons.sort((a, b) => {
      if (a.isApplicable && !b.isApplicable) return -1;
      if (!a.isApplicable && b.isApplicable) return 1;
      return b.discountPercentage - a.discountPercentage;
    });

    res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'Available coupons retrieved successfully.',
      count: availableCoupons.length,
      data: availableCoupons
    });
  } catch (err) {
    console.error('Error fetching available coupons:', err);
    res.status(500).json({
      statusCode: 500,
      success: false,
      message: err.message || 'Error fetching available coupons.'
    });
  }
};
