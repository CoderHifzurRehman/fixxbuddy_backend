const mongoose = require('mongoose');

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

const cartSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      default: generateOrderId,
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
      enum: ['addToCart', 'pending', 'inProgress', 'completed', 'cancelled'],
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
    }
  },
  {
    timestamps: true,
  }
);

// Add pre-save hook to handle uniqueness retries
cartSchema.pre('save', async function(next) {
  if (!this.isNew || this.orderId) return next(); // Skip if not new or orderId exists

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      this.orderId = generateOrderId();
      const exists = await mongoose.model('Cart').exists({ orderId: this.orderId });
      if (!exists) return next(); // Unique ID found
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) {
        return next(new Error('Failed to generate unique orderId after 3 attempts'));
      }
    }
  }
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;