const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  street: {
    type: String,
    required: true,
    trim: true,
  },
  city: {
    type: String,
    required: true,
    trim: true,
  },
  state: {
    type: String,
    required: true,
    trim: true,
  },
  country: {
    type: String,
    required: true,
    trim: true,
  },
  postalCode: {
    type: String,
    required: true,
    trim: true,
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    trim: true,
    enum: ['home', 'work', 'other'],
    default: 'home'
  }
}, { timestamps: true });

const contactNumberSchema = new mongoose.Schema({
  number: {
    type: String,
    required: true,
    trim: true,
    match: /^[0-9]{10,15}$/ // Basic phone number validation
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    trim: true,
    enum: ['mobile', 'home', 'work', 'other'],
    default: 'mobile'
  }
}, { timestamps: true });

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/,
    },
    password: {
      type: String,
    },
    otp: {
      type: Number,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'subadmin'],
      default: 'user',
    },    
    isActive: {
      type: Boolean,
      default: false,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    addresses: [addressSchema],
    contactNumbers: [contactNumberSchema],
  },
  {
    timestamps: true,
  }
);

// Middleware to ensure only one primary address exists
userSchema.pre('save', function(next) {
  // Check if addresses were modified and if any is set as primary
  if (this.isModified('addresses') && this.addresses.some(addr => addr.isPrimary)) {
    // Ensure only one primary address exists
    let primaryCount = 0;
    this.addresses.forEach(addr => {
      if (addr.isPrimary) primaryCount++;
      if (primaryCount > 1) addr.isPrimary = false;
    });
  }

  // Check if contactNumbers were modified and if any is set as primary
  if (this.isModified('contactNumbers') && this.contactNumbers.some(num => num.isPrimary)) {
    // Ensure only one primary contact number exists
    let primaryCount = 0;
    this.contactNumbers.forEach(num => {
      if (num.isPrimary) primaryCount++;
      if (primaryCount > 1) num.isPrimary = false;
    });
  }
  
  next();
});

// Password hashing middleware
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare the given password with the stored hashed password
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

const User = mongoose.model('user', userSchema);

module.exports = User;