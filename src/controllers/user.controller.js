const bcrypt = require("bcryptjs");
const { sendEmail } = require("../config/email");
const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");
const { otpMailTemplate } = require("../utils/mailingFunction");
const {
  uploadSingleImageToS3,
  uploadMultipleImagesToS3,
} = require("../utils/uploadImages");

const validatePasswordStrength = (password) => {
  const minLength = 8;

  // Regular expression for:
  // 1. At least one uppercase letter (A-Z)
  // 2. At least one lowercase letter (a-z)
  // 3. At least one digit (0-9)
  // 4. At least one special character (e.g. @$!%?&)
  // 5. Minimum 8 characters
  // Regex to check the password rules
  const regex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}\[\]|\\:;'"<>,.?/`~]).{8,16}$/;

  return password.length >= minLength && regex.test(password);
};

exports.userRegistration = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    const { file } = req;
    if (!file) {
      return res.status(400).send("No file uploaded.");
    }
    const folderName = `user/profilePic/${email}`; // Customize the folder name if needed
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

    // Check if password is strong enough
    if (!validatePasswordStrength(password)) {
      return res.status(400).send({
        statusCode: 409,
        message:
          "Password must be at least 8-16 characters long and contain a mix of uppercase, lowercase, numbers, and special characters.",
      });
    }

    // Proceed to create a new user
    const newUser = new User({
      firstName,
      lastName,
      email,
      imageUrl,
      password,
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
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).send({
        statusCode: 404,
        message: "User not found.",
      });
    }

    if (user.isEmailVerified) {
      const token = generateToken(user);

      // Compare the provided password with the stored hashed password
      const isPasswordMatch = await bcrypt.compare(password, user.password);

      if (!isPasswordMatch) {
        return res.status(400).send({
          statusCode: 400,
          message: "Invalid password.",
        });
      }
      return res.status(200).send({
        statusCode: 200,
        message: "Login successfully.",
        data: user,
        token: token,
      });
    } else {
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
        message: "Otp send to user email successfully.",
      });
    }
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
    const user = await User.findById(userId).select("-otp -otpExpiry");

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


// additional ]]

// Add a new address for the user
exports.addAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { street, city, state, country, postalCode, district, isPrimary, label } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ statusCode: 404, message: "User not found" });
    }

    const newAddress = {
      street,
      city,
      state,
      country,
      postalCode,
      district,
      isPrimary: isPrimary || false,
      label: label || 'home'
    };

    // If setting as primary, ensure no other primary exists
    if (newAddress.isPrimary) {
      user.addresses.forEach(addr => {
        addr.isPrimary = false;
      });
    }

    user.addresses.push(newAddress);
    await user.save();

    res.status(201).json({
      statusCode: 201,
      message: "Address added successfully",
      data: user.addresses,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Update an existing address
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;
    const updateData = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ statusCode: 404, message: "User not found" });
    }

    const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
      return res.status(404).json({ statusCode: 404, message: "Address not found" });
    }

    // If setting as primary, ensure no other primary exists
    if (updateData.isPrimary) {
      user.addresses.forEach(addr => {
        addr.isPrimary = false;
      });
    }

    // Update the address
    user.addresses[addressIndex] = {
      ...user.addresses[addressIndex].toObject(),
      ...updateData
    };

    await user.save();

    res.status(200).json({
      statusCode: 200,
      message: "Address updated successfully",
      data: user.addresses,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Delete an address
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ statusCode: 404, message: "User not found" });
    }

    const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
      return res.status(404).json({ statusCode: 404, message: "Address not found" });
    }

    // If deleting primary address, set another as primary if available
    const wasPrimary = user.addresses[addressIndex].isPrimary;
    user.addresses.splice(addressIndex, 1);

    if (wasPrimary && user.addresses.length > 0) {
      user.addresses[0].isPrimary = true;
    }

    await user.save();

    res.status(200).json({
      statusCode: 200,
      message: "Address deleted successfully",
      data: user.addresses,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Set primary address
exports.setPrimaryAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ statusCode: 404, message: "User not found" });
    }

    const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
      return res.status(404).json({ statusCode: 404, message: "Address not found" });
    }

    // Set all addresses to non-primary
    user.addresses.forEach(addr => {
      addr.isPrimary = false;
    });

    // Set the selected address as primary
    user.addresses[addressIndex].isPrimary = true;

    await user.save();

    res.status(200).json({
      statusCode: 200,
      message: "Primary address set successfully",
      data: user.addresses,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Add a new contact number
exports.addContactNumber = async (req, res) => {
  try {
    const userId = req.user.id;
    const { number, isPrimary, label } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ statusCode: 404, message: "User not found" });
    }

    const newContact = {
      number,
      isPrimary: isPrimary || false,
      label: label || 'mobile'
    };

    // If setting as primary, ensure no other primary exists
    if (newContact.isPrimary) {
      user.contactNumbers.forEach(contact => {
        contact.isPrimary = false;
      });
    }

    user.contactNumbers.push(newContact);
    await user.save();

    res.status(201).json({
      statusCode: 201,
      message: "Contact number added successfully",
      data: user.contactNumbers,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Update a contact number
exports.updateContactNumber = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const updateData = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ statusCode: 404, message: "User not found" });
    }

    const contactIndex = user.contactNumbers.findIndex(contact => contact._id.toString() === contactId);
    if (contactIndex === -1) {
      return res.status(404).json({ statusCode: 404, message: "Contact number not found" });
    }

    // If setting as primary, ensure no other primary exists
    if (updateData.isPrimary) {
      user.contactNumbers.forEach(contact => {
        contact.isPrimary = false;
      });
    }

    // Update the contact
    user.contactNumbers[contactIndex] = {
      ...user.contactNumbers[contactIndex].toObject(),
      ...updateData
    };

    await user.save();

    res.status(200).json({
      statusCode: 200,
      message: "Contact number updated successfully",
      data: user.contactNumbers,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Delete a contact number
exports.deleteContactNumber = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ statusCode: 404, message: "User not found" });
    }

    const contactIndex = user.contactNumbers.findIndex(contact => contact._id.toString() === contactId);
    if (contactIndex === -1) {
      return res.status(404).json({ statusCode: 404, message: "Contact number not found" });
    }

    // If deleting primary contact, set another as primary if available
    const wasPrimary = user.contactNumbers[contactIndex].isPrimary;
    user.contactNumbers.splice(contactIndex, 1);

    if (wasPrimary && user.contactNumbers.length > 0) {
      user.contactNumbers[0].isPrimary = true;
    }

    await user.save();

    res.status(200).json({
      statusCode: 200,
      message: "Contact number deleted successfully",
      data: user.contactNumbers,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Set primary contact number
exports.setPrimaryContactNumber = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ statusCode: 404, message: "User not found" });
    }

    const contactIndex = user.contactNumbers.findIndex(contact => contact._id.toString() === contactId);
    if (contactIndex === -1) {
      return res.status(404).json({ statusCode: 404, message: "Contact number not found" });
    }

    // Set all contacts to non-primary
    user.contactNumbers.forEach(contact => {
      contact.isPrimary = false;
    });

    // Set the selected contact as primary
    user.contactNumbers[contactIndex].isPrimary = true;

    await user.save();

    res.status(200).json({
      statusCode: 200,
      message: "Primary contact number set successfully",
      data: user.contactNumbers,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};
