const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user', // Reference to the user who owns this cart
      required: true
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    serviceName: {
      type: String,
      required: true
    },
    serviceCost: {
      type: Number,
      required: true
    },
    serviceImage: {
      type: String,
      default: ""
    },
    mainServiceId: {
      type: String,
      default: ""
    },
    applicationId: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ['addToCart', 'pending', 'assigned', 'inProgress', 'onHold', 'completed', 'cancelled'],
      default: 'addToCart'
    },
    holdReason: {
      type: String,
      default: ""
    },
    holdNotes: {
      type: String,
      default: ""
    },
    holdAt: {
      type: Date
    },
    resumedAt: {
      type: Date
    },
    quantity: {
      type: Number,
      default: 1
    },
    assignedPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'partner' },
    scheduledDate: Date,
    scheduledStartTime: {
      type: String,
      default: "" // e.g. "10:00"
    },
    scheduledEndTime: {
      type: String,
      default: "" // e.g. "11:30"
    },
    scheduledSlot: {
      type: String,
      default: "" // e.g. "1:00 PM - 2:00 PM"
    },
    cancellationFee: {
      type: Number,
      default: 0
    },
    cancellationFeeAccepted: {
      type: Boolean,
      default: false
    },
    cancelledAt: Date,
    cancelledBy: {
      role: { type: String }, // 'customer', 'admin', 'manager', 'teamLeader', 'partner'
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String }
    },
    cancellationReason: { type: String, default: "" },
    cancellationNotes: { type: String, default: "" },
    rescheduledAt: Date,
    orderedAt: Date,
    tracking: [{
      message: String,
      date: { type: Date, default: Date.now },
      status: String
    }],

    // New fields for address and contact
    deliveryAddress: {
      _id: mongoose.Schema.Types.ObjectId,
      label: String,
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      isPrimary: Boolean
    },
    contactNumber: {
      _id: mongoose.Schema.Types.ObjectId,
      label: String,
      number: String,
      isPrimary: Boolean
    },
    // OTP fields for service start verification
    serviceOtp: {
      type: Number,
      required: false
    },
    serviceOtpExpiry: {
      type: Date,
      required: false
    },
    otpVerified: {
      type: Boolean,
      default: false
    },

    // Service completion fields
    completedAt: {
      type: Date
    },
    warrantyMonths: {
      type: Number,
      default: 3
    },
    warrantyExpiresAt: {
      type: Date
    },
    warrantyClaim: {
      claimed: { type: Boolean, default: false },
      claimId: { type: String, default: "" },
      reason: { type: String, default: "" },
      notes: { type: String, default: "" },
      status: {
        type: String,
        enum: ['none', 'pending', 'approved', 'assigned', 'inProgress', 'completed', 'rejected', 'not_applicable', 'cancelled'],
        default: 'none'
      },
      claimedAt: { type: Date },
      assignedPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'partner' },
      scheduledDate: { type: Date },
      scheduledStartTime: { type: String, default: "" },
      scheduledEndTime: { type: String, default: "" },
      scheduledSlot: { type: String, default: "" },
      resolvedAt: { type: Date },
      resolutionNotes: { type: String, default: "" },
      rejectionReason: { type: String, default: "" },
      notApplicableReason: { type: String, default: "" }
    },
    serviceNotes: {
      type: String
    },
    customerFeedback: {
      type: String
    },
    couponCode: {
      type: String
    },
    discountAmount: {
      type: Number,
      default: 0
    },
    // Pricing breakdown fields
    originalServiceCost: {
      type: Number,
      default: 0
    },
    serviceLevelDiscountPercentage: {
      type: Number,
      default: 0
    },
    serviceLevelDiscountAmount: {
      type: Number,
      default: 0
    },
    couponDiscountAmount: {
      type: Number,
      default: 0
    },
    additionalItemsCost: {
      type: Number,
      default: 0
    },
    grossTotalCost: {
      type: Number,
      default: 0
    },
    quotationCost: {
      type: Number,
      default: 0
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'quotation'
    },
    finalAmount: {
      type: Number,
      default: 0
    },
    serviceImages: {
      preService: {
        type: [String],
        default: []
      },
      postService: {
        type: [String],
        default: []
      }
    },
    serviceRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    serviceFeedback: {
      type: String,
      default: ""
    },
    partnerRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    partnerFeedback: {
      type: String,
      default: ""
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    ratingFeedback: {
      type: String,
      default: ""
    },
    isRated: {
      type: Boolean,
      default: false
    },
    ratedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
  }
);

// Helpful compound indexes for operational scheduling and conflict checking
cartSchema.index({ assignedPartner: 1, scheduledDate: 1, status: 1 });
cartSchema.index({ status: 1, scheduledDate: 1 });

// Method to calculate totals safely and reliably without overriding checkout discounts
cartSchema.methods.calculateTotals = function() {
  const baseCost = this.originalServiceCost > 0 ? this.originalServiceCost : this.serviceCost;
  
  // Use additionalItemsCost or quotationCost if applicable
  const extraCost = this.additionalItemsCost || this.quotationCost || 0;
  
  this.grossTotalCost = baseCost + extraCost;
  
  // Keep the distributed checkout discounts intact
  const discountAmt = (this.serviceLevelDiscountAmount || 0) + (this.couponDiscountAmount || 0);
  this.discountAmount = discountAmt;
  
  let finalAmt = this.grossTotalCost - discountAmt;
  if (finalAmt < 0) finalAmt = 0;
  
  this.finalAmount = finalAmt;
  
  return this.finalAmount;
};

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
