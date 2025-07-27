const { sendEmail } = require("../config/email");
const Partner = require("../models/partner.model");
const { generateToken } = require("../utils/jwt");
const bcrypt = require("bcryptjs");

const { uploadMultipleImagesToS3 } = require("../utils/uploadImages");

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

exports.partnerRegistration = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      dob,
      aadharCardNumber,
      contactNumber,
      address,
      gender,
      bloodGroup,
      designation,
      expertise,
      hub,
      createdBy,
    } = req.body;

     // Backward compatibility for fullName
    let firstNameVal = firstName;
    let lastNameVal = lastName;
    
    if (!firstName && req.body.fullName) {
      const nameParts = req.body.fullName.split(' ');
      firstNameVal = nameParts[0] || '';
      lastNameVal = nameParts.slice(1).join(' ') || '';
    }

    // Validate required name fields
    if (!firstNameVal) {
      return res.status(400).send({
        statusCode: 400,
        message: "First name is required",
      });
    }

    // Check if password is strong enough
    if (!validatePasswordStrength(password)) {
      return res
        .status(400)
        .send(
          "Password must be at least 8-16 characters long and contain a mix of uppercase, lowercase, numbers, and special characters."
        );
    }

    const existingPartner = await Partner.findOne({ email });

    if (existingPartner) {
      return res.status(409).send({
        statusCode: 409,
        message: "Partner already exists.",
      });
    }

    // Create full address string from components
    const fullAddress = [
      address.street,
      address.city,
      address.district,
      address.state,
      address.pincode
    ].filter(Boolean).join(", ");

    // Proceed to create a new newPartner
    const newPartner = new Partner({
      firstName: firstNameVal,
      lastName: lastNameVal,
      email,
      password,
      dob,
      aadharCardNumber,
      contactNumber,
      address: {
        ...address,
        pincode: address.pincode,
        fullAddress
      },
      gender,
      bloodGroup,
      designation,
      expertise,
      hub,
      createdBy,
    });

    // Save the new Partner to the database
    await newPartner.save();

    res.status(201).send({
      statusCode: 201,
      message: "Partner registered successfully.",
      data: { email,partnerId: newPartner._id, address: newPartner.address },
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

exports.partnerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const partner = await Partner.findOne({ email });

    if (!partner) {
      return res.status(404).send({
        statusCode: 404,
        message: "User not found.",
      });
    }

    // const isPasswordMatch = await bcrypt.compare(password, user.password);
    const isPasswordMatch = await bcrypt.compare(password, partner.password);

    if (!isPasswordMatch) {
      return res.status(400).send({
        statusCode: 400,
        message: "Invalid password.",
      });
    }
    // If password matches, generate a token
    const token = generateToken(partner);

    res.status(200).send({
      statusCode: 200,
      message: "partner login successfully.",
      data: partner,
      token: token,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

exports.uploadImages = async (req, res) => {
  try {
    // console.log(req.files);
    const { profilePic, aadharFrontPic, aadharBackPic, PanPic, pcc } = req.files || {};
    const partnerId = req.params.id;
    const folderName = `partner/images/${partnerId}`;
    const updateFields = {};
  
    // Upload and update only if the image exists
    if (profilePic && profilePic[0]) {
      const [profilePicUrl] = await uploadMultipleImagesToS3([profilePic[0]], folderName);
      updateFields.profilePic = profilePicUrl;
    }
  
    if (aadharFrontPic && aadharFrontPic[0]) {
      const [aadharFrontPicUrl] = await uploadMultipleImagesToS3([aadharFrontPic[0]], folderName);
      updateFields.aadharFrontPic = aadharFrontPicUrl;
    }
    
    if (aadharBackPic && aadharBackPic[0]) {
      const [aadharBackPicUrl] = await uploadMultipleImagesToS3([aadharBackPic[0]], folderName);
      updateFields.aadharBackPic = aadharBackPicUrl;
    }

    if (PanPic && PanPic[0]) {
      const [PanPicUrl] = await uploadMultipleImagesToS3([PanPic[0]], folderName);
      updateFields.PanPic = PanPicUrl;
    }

    if (pcc && pcc[0]) {
      const [pccUrl] = await uploadMultipleImagesToS3([pcc[0]], folderName);
      updateFields.pcc = pccUrl;
    }
  
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).send({
        statusCode: 400,
        message: "No images provided for upload.",
      });
    }
  
    const updatedUser = await Partner.findByIdAndUpdate(partnerId, updateFields, {
      new: true,
    });
  
    if (!updatedUser) {
      return res.status(404).send({ statusCode: 404, message: "User not found." });
    }
  
    res.status(200).send({
      statusCode: 200,
      message: "Images uploaded and updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).send({
      statusCode: 500,
      message: "Something went wrong during image upload.",
      error: error.message,
    });
  }
  
};


exports.updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      dob,
      aadharCardNumber,
      contactNumber,
      address,
      gender,
      bloodGroup,
      designation,
      expertise,
      hub,
    } = req.body;
    
    // First get the current partner data
    const existingPartner = await Partner.findById(req.params.id);
    if (!existingPartner) {
      return res.status(404).send({
        statusCode: 404,
        message: "Partner not found",
      });
    }
    
    // Backward compatibility
    let firstNameVal = firstName !== undefined ? firstName.trim() : existingPartner.firstName;
    let lastNameVal = lastName !== undefined ? lastName.trim() : existingPartner.lastName;
    
    if (!firstName && req.body.fullName) {
      const nameParts = req.body.fullName.split(' ');
      firstNameVal = nameParts[0] || '';
      lastNameVal = nameParts.slice(1).join(' ') || '';
    }

    const partnerId = req.params.id;

    // Ensure password is strong if provided
    if (password && !validatePasswordStrength(password)) {
      return res.status(400).send({
        statusCode: 400,
        message: "Password must be at least 8-16 characters long and contain a mix of uppercase, lowercase, numbers, and special characters.",
      });
    }

    // Prepare updated fields
    const updatedFields = {
      firstName: firstNameVal,
      lastName: lastNameVal,
      fullName: lastNameVal.trim() 
        ? `${firstNameVal.trim()} ${lastNameVal.trim()}`
        : firstNameVal.trim(),
      email,
      dob,
      aadharCardNumber,
      contactNumber,
      address,
      gender,
      bloodGroup,
      designation,
      expertise,
      hub,
    };

    // Handle address update if provided
    if (address) {
      const fullAddress = [
        address.street,
        address.city,
        address.district,
        address.state,
        address.pincode
      ].filter(Boolean).join(", ");

      updatedFields.address = {
        ...address,
        fullAddress
      };
    }


    // If password is provided, hash it
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10); // Hashing the password with a salt of 10 rounds
      updatedFields.password = hashedPassword;
    }

    // Find and update the partner in the database
    const updatedPartner = await Partner.findByIdAndUpdate(partnerId, updatedFields, { new: true });

    if (!updatedPartner) {
      return res.status(404).send({
        statusCode: 404,
        message: "Partner not found.",
      });
    }

    res.status(200).send({
      statusCode: 200,
      message: "Profile updated successfully.",
      data: updatedPartner,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    console.error("Error updating profile:", errorMsg);
    res.status(500).send({
      statusCode: 500,
      message: errorMsg,
    });
  }
};



//getSinglePartner

exports.getSinglePartner = async (req, res) => {
  try {
    const partnerId = req.params.id;

    // Assuming you're using a MongoDB model called partner
    const partner = await Partner.findById(partnerId);

    // Check if the vehicle exists
    if (!partner) {
      return res.status(404).send({
        statusCode: 404,
        message: "Partner not found",
      });
    }

    const partnerData = partner.toObject();
    partnerData.fullName = partner.fullName; // Add virtual field

    res.status(200).send({
      statusCode: 200,
      message: "Get partner successfully",
      data: partnerData
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

//delete partner

exports.deletePartner = async (req, res) => {
  try {
    const partnerId = req.params.id;

    // Assuming you're using a MongoDB model called partner
    const partner = await Partner.findById(partnerId);

    // Check if the partner exists
    if (!partner) {
      return res.status(404).send({
        statusCode: 404,
        message: "Partner not found",
      });
    }

    // Delete the Partner
    await Partner.deleteOne({ _id: partnerId });

    res.status(200).send({
      statusCode: 200,
      message: "partner deleted successfully",
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

//getAllPartenrs

exports.getAllPartenrs = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const sorted = { createdAt: -1 };
    const query = {
      // userId: req.user.id,
    };
    const partner = await exports.PartnerServicesPagination(
      page,
      limit,
      sorted,
      query
    );

    // console.log(partner);
    if (partner.data.length === 0) {
      return res.status(404).send({
        statusCode: 404,
        message: "No Partner found for this criteria",
      });
    }

    res.status(200).send({
      statusCode: 200,
      message: "Partner fetch successfully",
      pagination: partner.pagination,
      data: partner.data,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};




exports.PartnerServicesPagination = async (page, limit, sorted, query) => {
  try {
    const skip = (page - 1) * limit;

    const data = await Partner.find(query)
      .sort(sorted)
      .skip(skip)
      .limit(limit)
      .lean();

    // Get the total count for pagination metadata
    const totalCount = await Partner.countDocuments(query);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    // Create the pagination object
    const pagination = {
      totalCount,
      totalPages,
      currentPage: page,
      pageSize: limit,
    };
    return { data, pagination };
  } catch (error) {
    throw new Error(error.message);
  }
};