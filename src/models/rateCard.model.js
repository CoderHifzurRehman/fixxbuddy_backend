const mongoose = require('mongoose');

const rateCardSchema = new mongoose.Schema(
  {
    applicationTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'applicationType', // Ensure this matches the model name in applicationType.model.js
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['Part', 'Service', 'Labor'],
      default: 'Part',
    },
    price: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const RateCard = mongoose.model('rateCard', rateCardSchema);

module.exports = RateCard;
