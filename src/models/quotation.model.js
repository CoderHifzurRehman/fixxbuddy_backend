const mongoose = require('mongoose');

const quotationItemSchema = new mongoose.Schema({
  rateCardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'rateCard',
    required: true,
  },
  name: {
    type: String, // Snapshot of item name
    required: true,
  },
  price: {
    type: Number, // Snapshot of item price
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
  },
  total: {
    type: Number,
    required: true,
  }
});

const quotationSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId, // Or String if strictly using the custom string ID, but usually ref implies ObjectId.
      // Looking at partner.model, _id is String? 
      // "const CounterSchema = new mongoose.Schema({ _id: { type: String, required: true }, ... });"
      // "const partnerSchema ... partnerId: { type: String, unique: true } ... "
      // Default mongo _id is ObjectId unless overridden. Partner model doesn't override _id, it adds a *partnerId* field.
      // So references should essentially use ObjectId if we are using populate().
      ref: 'partner',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    applicationTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'applicationType',
      required: true,
    },
    orderId: {
      type: String, // Matching the custom orderId format (e.g., FBORD...)
    },
    items: [quotationItemSchema],
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Generated', 'Accepted', 'Rejected'],
      default: 'Generated',
    },
  },
  {
    timestamps: true,
  }
);

const Quotation = mongoose.model('quotation', quotationSchema);

module.exports = Quotation;
