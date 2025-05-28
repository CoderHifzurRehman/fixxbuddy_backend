const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    lastName: {
      type: String,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true, // Ensures email is unique
      match: /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/, // Validates email format
    },
    password :{
      type: String,
    },
    otp: {
      type: Number,
      default: null, // Can be null when OTP is not in use
    },
    otpExpiry: {
      type: Date,
      default: null, // Can be null when OTP is not in use
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'subadmin'],
      default: 'user',
    },    
    isActive: {
      type:Boolean,
      default:false,
    },
    imageUrl:{
      type:String,
      default:"",
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
  },
  {
    timestamps: true,
  }
);


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