const { sendEmail } = require("../config/email");
const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");
const { otpMailTemplate } = require("../utils/mailingFunction");
const {
  uploadSingleImageToS3,
  uploadMultipleImagesToS3,
} = require("../utils/uploadImages");

exports.userRegistration = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;

    const { file } = req;
    if (!file) {
      return res.status(400).send("No file uploaded.");
    }
    const folderName = `partner/prfilePIC/${email}`; // Customize the folder name if needed
    // console.log(folderName);

    const imageUrl = await uploadSingleImageToS3(file, folderName);
    // console.log(imageUrl);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).send({
        statusCode: 409,
        message: "User already exists. Check email for otp.",
      });
    }

    // Proceed to create a new user
    const newUser = new User({
      firstName,
      lastName,
      email,
      imageUrl,
    });

    // Save the new user to the database
    const savedUser = await newUser.save();

    // Generate a token (Make sure you have the token generation logic)
    const token = generateToken(savedUser); // Example function, replace with actual
    const sendData = {
      firstName: savedUser?.firstName,
      lastName: savedUser?.lastName,
      email: savedUser?.email,
      imageUrl,
      role: savedUser?.role,
      isActive: savedUser?.isActive,
      isEmailVerified: savedUser?.isEmailVerified,
      profilePic: savedUser?.profilePic,
    };

    res.status(201).send({
      statusCode: 201,
      message: "User registered successfully.",
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

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).send({
        statusCode: 404,
        message: "User not found.",
      });
    }
    // Generate OTP (6-digit random number)
    const otp = Math.floor(100000 + Math.random() * 900000); // Generates a 6-digit OTP
    // console.log(otp, "otp in the login ");
    // Set OTP expiration time to 10 minutes from now
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update the user with new OTP and expiry
    user.otp = otp;
    user.otpExpiry = otpExpiry;

    // Save the updated user
    await user.save();

    const subject = "Your OTP Code for Account Verification";
    await sendEmail(subject, user.email, otpMailTemplate(user));

    res.status(200).send({
      statusCode: 200,
      message: "user login successfully.",
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

//verify otp

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Check if email and OTP are provided
    if (!email || !otp) {
      return res.status(400).send({
        statusCode: 400,
        message: "Email and OTP are required.",
      });
    }

    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).send({
        statusCode: 404,
        message: "User not found.",
      });
    }

    // Check if OTP matches and is still valid
    const currentTime = new Date();

    // Compare the provided OTP with the saved OTP
    if (user.otp !== Number(otp)) {
      return res.status(400).send({
        statusCode: 400,
        message: "Invalid OTP.",
      });
    }

    // Check if OTP has expired
    if (currentTime > user.otpExpiry) {
      return res.status(400).send({
        statusCode: 400,
        message: "OTP has expired.",
      });
    }

    // Generate a token (Make sure you have the token generation logic)
    const token = generateToken(user); // Example function, replace with actual
    // Update the user with new OTP and expiry
    user.otp = null;
    user.otpExpiry = null;
    user.isActive = true;

    user.isEmailVerified = true;

    // Save the updated user
    await user.save();

    // OTP is valid and not expired, proceed to verify user or update status
    res.status(200).send({
      statusCode: 200,
      message: "OTP verified successfully.",
      data: user,
      token: token,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({
      statusCode: 500,
      message: errorMsg,
    });
  }
};

//getUserProfile

exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming the JWT contains the user ID in the `_id` field
    // console.log(req.user)
    // return
    // Fetch the user profile from the database
    const user = await User.findById(userId).select("-otp otpExpiry ");

    if (!user) {
      return res
        .status(404)
        .json({ statusCode: 404, message: "User not found" });
    }

    // Return the user's profile
    res.status(200).json({
      statusCode: 200,
      message: "User profile retrieved successfully",
      data: user,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

//updateUserProfile
exports.updateUserProfile = async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    const { id } = req.params;
    // Find the user by ID
    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .send({ statusCode: 404, message: "User not found." });
    }
    // Handle image upload if a file is provided
    let imageUrl = user.imageUrl; // Use the current image if no new image is provided
    if (req.file) {
      const { file } = req;
      if (!file) {
        return res.status(400).send("No file uploaded.");
      }

      const folderName = `user/profilePic/${user.email}`; // Customize the folder name if needed
      // console.log("Folder Name: ", folderName);

      // Upload image to S3 and get the image URL
      imageUrl = await uploadSingleImageToS3(file, folderName);
    }

    // Update user fields
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.imageUrl = imageUrl;

    // Save the updated user document
    await user.save();

    res.status(200).send({
      statusCode: 200,
      message: "User profile updated successfully.",
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};
