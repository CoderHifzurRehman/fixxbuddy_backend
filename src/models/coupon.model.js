const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    discountPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    maxDiscountAmount: {
      type: Number,
      default: null, // null means no limit
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableTo: [
      {
        applicationTypeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'applicationType',
          required: true,
        },
        // If this array is empty, it means ALL service types under this application type are eligible.
        // If populated, only the specified service type IDs are eligible.
        serviceTypeIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'serviceType',
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Method to check if coupon is valid for a specific date
couponSchema.methods.isValid = function() {
  const now = new Date();
  return this.isActive && now >= this.validFrom && now <= this.validUntil;
};

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;
