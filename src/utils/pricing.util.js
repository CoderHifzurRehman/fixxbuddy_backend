const ServiceType = require('../models/serviceType.model');
const Coupon = require('../models/coupon.model');

/**
 * Calculate full pricing breakdown for a service
 * @param {string|ObjectId} serviceId - The ID of the service
 * @param {number} quantity - Quantity of the service (default 1)
 * @param {string} couponCode - Applied coupon code (if any)
 * @param {Array} additionalItems - Rate card items [{ price, quantity }, ...]
 * @returns {Object} Full pricing breakdown
 */
const calculatePricing = async (serviceId, quantity = 1, couponCode = null, additionalItems = [], currentBaseCost = null) => {
  let baseServiceOriginalCost = 0;
  let serviceDiscountPercent = 0;
  let serviceDiscountAmount = 0;
  let couponCodeApplied = null;
  let couponDiscountAmount = 0;
  let additionalItemsCost = 0;
  
  // 1. Fetch Service details for discount info
  const service = await ServiceType.findById(serviceId);
  
  if (currentBaseCost !== null && currentBaseCost !== undefined) {
    baseServiceOriginalCost = Number(currentBaseCost);
  } else if (service && service.serviceCost) {
    const dbCost = Number(service.serviceCost);
    if (!isNaN(dbCost) && dbCost > 0) {
      baseServiceOriginalCost = dbCost * quantity;
    }
  }

  // 2. Calculate Additional Items Cost (Rate Card / Quotation)
  if (additionalItems && Array.isArray(additionalItems)) {
    additionalItems.forEach(item => {
      additionalItemsCost += (Number(item.price) || 0) * (Number(item.quantity) || 1);
    });
  }

  // 3. Service Level Discount
  if (service && service.discountPercentage > 0) {
    const now = new Date();
    const validUntil = service.discountValidUntil ? new Date(service.discountValidUntil) : null;

    if (!validUntil || validUntil >= now) {
      serviceDiscountPercent = service.discountPercentage;
      serviceDiscountAmount = (baseServiceOriginalCost * serviceDiscountPercent) / 100;
    }
  }

  const amountAfterServiceDiscount = baseServiceOriginalCost - serviceDiscountAmount;
  const grossTotalCost = baseServiceOriginalCost + additionalItemsCost;

  // 4. Coupon Logic (Only applies to service base cost, not additional items typically, unless specified)
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
    if (coupon && coupon.isValid()) {
      let isApplicable = false;
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
        couponCodeApplied = coupon.code;
        // Calculate standard coupon discount %
        let calculatedCouponDiscount = (amountAfterServiceDiscount * coupon.discountPercentage) / 100;
        
        // Safety caps
        if (coupon.maxDiscountAmount && calculatedCouponDiscount > coupon.maxDiscountAmount) {
          calculatedCouponDiscount = coupon.maxDiscountAmount;
        }
        if (calculatedCouponDiscount > amountAfterServiceDiscount) {
          calculatedCouponDiscount = amountAfterServiceDiscount;
        }
        
        couponDiscountAmount = calculatedCouponDiscount;
      }
    }
  }

  // 5. Final Calculation
  let netFinalAmount = (amountAfterServiceDiscount - couponDiscountAmount) + additionalItemsCost;
  if (netFinalAmount < 0) netFinalAmount = 0;

  return {
    baseServiceOriginalCost,
    additionalItemsCost,
    grossTotalCost,
    serviceDiscountPercent,
    serviceDiscountAmount,
    couponCodeApplied,
    couponDiscountAmount,
    netFinalAmount
  };
};

module.exports = {
  calculatePricing
};
