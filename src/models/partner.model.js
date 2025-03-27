const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const partnerSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
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
    password: {
      type: String
    },
    dob: {
      type: String
    },
    aadharCardNumber: {
      type: String, // Store as a string to prevent leading zeros from being removed
      required: true,
      unique: true,
      match: [/^\d{12}$/, "Aadhar number must be exactly 12 digits"], // Ensures only 12 digits
    },
    contactNumber: {
      type: String
    },
    address: {
      type: String
    },
    pinCode: {
      type: Number,
      default : "",

    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      default: 'Male',
    },
    bloodGroup: {
      type: String,
    },
    designation: {
      type: String,
    },
    expertise: [String],
    hub: [String],
    createdBy: {
      type: String,
      default: "Invalid User"
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
      enum: ['partner', 'admin', 'subadmin'],
      default: 'partner',
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    profilePic: {
      type: String,
      default: "",
    },
    aadharPic: {
      type: String,
      default: "",
    },
    pcc: {
      type: String,
      default: "",
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




// Hash password before saving
partnerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});




const Partner = mongoose.model('partner', partnerSchema);

module.exports = Partner;