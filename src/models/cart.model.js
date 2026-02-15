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
      enum: ['addToCart', 'pending', 'assigned', 'inProgress', 'completed', 'cancelled'],
      default: 'addToCart'
    },
    quantity: {
      type: Number,
      default: 1
    },
    assignedPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'partner' },
    scheduledDate: Date,
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
    serviceImages: {
      preService: {
        type: [String],
        default: []
      },
      postService: {
        type: [String],
        default: []
      }
    }
  },
  {
    timestamps: true,
  }
);

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;