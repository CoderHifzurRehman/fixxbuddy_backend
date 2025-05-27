const { sendEmail } = require("../config/email");
const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");
const { otpMailTemplate } = require("../utils/mailingFunction");
const {
  uploadSingleImageToS3,
  uploadMultipleImagesToS3,
} = require("../utils/uploadImages");

exports.initiateRegistration = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).send({
        statusCode: 409,
        message: "User already exists.",
      });
    }

    // Generate OTP (6-digit random number)
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create a temporary user with only email and OTP details
    const tempUser = new User({
      email,
      otp,
      otpExpiry,
      isActive: false, // User will be activated after OTP verification
    });

    await tempUser.save();

    // Send OTP email
    const subject = "Your OTP Code for Account Verification";
    await sendEmail(subject, email, otpMailTemplate({ email, otp }));

    res.status(200).send({
      statusCode: 200,
      message: "OTP sent to email for verification.",
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

exports.verifyRegistrationOtp = async (req, res) => {
  try {
    const { email, otp, firstName, lastName } = req.body;
    const { file } = req;

    // Check if all required fields are provided
    if (!email || !otp || !firstName || !lastName) {
      return res.status(400).send({
        statusCode: 400,
        message: "Email, OTP, firstName, and lastName are required.",
      });
    }

    // Find the temporary user
    const tempUser = await User.findOne({ email, isActive: false });

    if (!tempUser) {
      return res.status(404).send({
        statusCode: 404,
        message: "No pending registration found for this email.",
      });
    }

    // Check OTP and expiry
    const currentTime = new Date();
    if (tempUser.otp !== Number(otp)) {
      return res.status(400).send({
        statusCode: 400,
        message: "Invalid OTP.",
      });
    }

    if (currentTime > tempUser.otpExpiry) {
      return res.status(400).send({
        statusCode: 400,
        message: "OTP has expired.",
      });
    }

    // Handle image upload
    if (!file) {
      return res.status(400).send("No file uploaded.");
    }
    const folderName = `partner/profilePIC/${email}`;
    const imageUrl = await uploadSingleImageToS3(file, folderName);

    // Update user with complete profile information
    tempUser.firstName = firstName;
    tempUser.lastName = lastName;
    tempUser.imageUrl = imageUrl;
    tempUser.otp = null;
    tempUser.otpExpiry = null;
    tempUser.isActive = true;
    tempUser.isEmailVerified = true;

    const savedUser = await tempUser.save();

    // Generate token
    const token = generateToken(savedUser);
    const sendData = {
      firstName: savedUser.firstName,
      lastName: savedUser.lastName,
      email: savedUser.email,
      imageUrl: savedUser.imageUrl,
      role: savedUser.role,
      isActive: savedUser.isActive,
      isEmailVerified: savedUser.isEmailVerified,
      profilePic: savedUser.profilePic,
    };

    res.status(201).send({
      statusCode: 201,
      message: "User registered and verified successfully.",
      data: sendData,
      token: token,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

exports.userLogin = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isActive: true });

    if (!user) {
      return res.status(404).send({
        statusCode: 404,
        message: "User not found.",
      });
    }

    // Generate OTP (6-digit random number)
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update the user with new OTP and expiry
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    const subject = "Your OTP Code for Login";
    await sendEmail(subject, user.email, otpMailTemplate(user));

    res.status(200).send({
      statusCode: 200,
      message: "OTP sent to email for login.",
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// verifyOtp, getUserProfile, and updateUserProfile remain the same as in your original code