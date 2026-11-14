const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const serviceTypeSchema = new mongoose.Schema(
  {
    applicationTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "applicationType"
    },
    serviceHeading: {
      type: String,
      required: true,
      trim: true,
    },
    serviceName: {
      type: String,
      trim: true,
    },
    serviceDescription: {
      type: String,
      trim: true,
      default: ''
    },
    serviceCost: {
      type: String,
      trim: true,
      default: ''
    },
    serviceDetails: {
      type: String,
      trim: true,
      default: ''
    },   
    serviceVideoLink: {
      type: String,
      trim: true,
      default: ''
    },   
    isActive: {
      type: Boolean,
      default: true,
    },
    serviceImage: {
      type: [String],
      default: [],
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    discountValidUntil: {
      type: Date,
      default: null
    },
    rateCardPdf: {
      type: String,
      trim: true,
      default: ''
    },
    discountTerms: {
      type: String,
      trim: true,
      default: ''
    },
    warrantyMonths: {
      type: Number,
      default: 3,
      min: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRatings: {
      type: Number,
      default: 0
    },
    ratings: [
      {
        cartId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cart' },
        orderId: { type: String, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
        userName: { type: String, default: 'Customer' },
        rating: { type: Number, required: true, min: 1, max: 5 },
        feedback: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  {
    timestamps: true,
  }
);

const ServiceType = mongoose.model('serviceType', serviceTypeSchema);

module.exports = ServiceType;
