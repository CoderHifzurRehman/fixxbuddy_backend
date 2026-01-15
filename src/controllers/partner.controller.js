const { sendEmail } = require("../config/email");
const Partner = require("../models/partner.model");
const { generateToken } = require("../utils/jwt");
const bcrypt = require("bcryptjs");
const Cart = require('../models/cart.model');
const Quotation = require('../models/quotation.model');
const { uploadMultipleImagesToS3 } = require("../utils/uploadImages");
const { serviceStartOtpTemplate } = require("../utils/mailingFunction");
const ably = require("../utils/ably");

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

    // Check if the partner exists and is not soft-deleted
    if (!partner || partner.isDeleted) {
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
      isDeleted: { $ne: true }
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


// Add these methods to your partner.controller.js

exports.getPartnerDashboard = async (req, res) => {
  try {
    const partnerId = req.user.id;
    
    // Get all tasks assigned to this partner
    const tasks = await Cart.find({ 
      assignedPartner: partnerId 
    }).populate('userId', 'name email firstName lastName')
      .sort({ createdAt: -1 });
    
    // Calculate earnings from completed tasks
    const completedTasks = tasks.filter(task => task.status === 'completed');
    const earnings = completedTasks.reduce((total, task) => total + (task.serviceCost * task.quantity), 0);
    
    // Get all quotations for this partner
    const quotations = await Quotation.find({ partnerId })
      .populate('userId', 'firstName lastName email')
      .populate('applicationTypeId', 'serviceName')
      .sort({ createdAt: -1 });
    
    // Link quotations to tasks
    const tasksWithQuotations = tasks.map(task => {
      const taskObj = task.toObject();
      // Find quotation for this task (matching custom orderId string)
      taskObj.quotation = quotations.find(q => q.orderId === task.orderId);
      return taskObj;
    });

    res.json({
      success: true,
      partnerId: partnerId,
      tasks: tasksWithQuotations,
      earnings,
      quotation: quotations,
      stats: {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        inProgress: tasks.filter(t => t.status === 'inProgress').length,
        completed: completedTasks.length,
        cancelled: tasks.filter(t => t.status === 'cancelled').length
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data'
    });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, partnerAction } = req.body;
    const partnerId = req.user.id;
    
    // Find the task assigned to this partner
    const task = await Cart.findOne({ 
      _id: taskId, 
      assignedPartner: partnerId 
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or not assigned to you'
      });
    }
    
    // Validate status transition
    const validTransitions = {
      'pending': ['inProgress', 'assigned'],
      'assigned': ['completed', 'cancelled', 'inProgress', 'pending'],
      'inProgress': ['completed', 'cancelled', 'inProgress'],
    };
    
    if (!validTransitions[task.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${task.status} to ${status}`
      });
    }
    
    // Update task status
    task.status = status;
    
    // Add tracking entry
    const actionMessages = {
      'accept': 'Task accepted by partner',
      'reject': 'Task rejected by partner',
      'complete': 'Task completed by partner',
      'cancel': 'Task cancelled by partner'
    };

    let setMessage = actionMessages[partnerAction] || `Status changed to ${status}`;
    if(req.body.trackingUpdate && req.body.trackingUpdate.message){
      setMessage = req.body.trackingUpdate.message;
    }
    console.log(req.body)
    
    task.tracking.push({
      message: setMessage || `Status changed to ${status}`,
      status: status,
      date: new Date()
    });
    
    await task.save();
    
    // Trigger Ably event for admin
    ably.channels.get("admin-channel").publish("task_updated", {
      message: `Task ${status} by partner`,
      taskId: task._id,
      status: status
    });

    // Notify User (Customer)
    ably.channels.get(`user-${task.userId}`).publish("order_status_updated", {
      message: `Your task is now ${status}`,
      taskId: task._id,
      status: status
    });
    
    res.json({
      success: true,
      message: `Task ${partnerAction}ed successfully`,
      task
    });
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating task status'
    });
  }
};

// Add these new methods to partner.controller.js

exports.startService = async (req, res) => {
  try {
    const { taskId } = req.params;
    const partnerId = req.user.id;

    // Find the task assigned to this partner
    const task = await Cart.findOne({ 
      _id: taskId, 
      assignedPartner: partnerId,
      status: 'inProgress'
    }).populate('userId', 'email firstName lastName');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or not in progress status'
      });
    }

    // Generate OTP (6-digit random number)
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update task with OTP details
    task.serviceOtp = otp;
    task.serviceOtpExpiry = otpExpiry;
    task.otpVerified = false;
    
    await task.save();

    // TODO: Send OTP to user's phone via SMS service
    // For now, we'll log it (in production, integrate with SMS service like Twilio)
    console.log(`OTP for task ${taskId}: ${otp}`);
    console.log(`Send to user: ${task?.contactNumber?.number}`);

    // Also send email notification
    const subject = "Service Starting OTP - Fixxbuddy";
    await sendEmail(subject, task.userId.email, serviceStartOtpTemplate(task.userId, otp));

    res.json({
      success: true,
      message: 'OTP sent to customer successfully',
      // Remove this in production - only for testing
      // otp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  } catch (error) {
    console.error('Start service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting service'
    });
  }
};

exports.verifyServiceOtp = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { otp } = req.body;
    const partnerId = req.user.id;

    // Find the task
    const task = await Cart.findOne({ 
      _id: taskId, 
      assignedPartner: partnerId,
      status: 'inProgress'
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check if OTP exists and is not expired
    if (!task.serviceOtp || !task.serviceOtpExpiry) {
      return res.status(400).json({
        success: false,
        message: 'OTP not generated for this service'
      });
    }

    if (new Date() > task.serviceOtpExpiry) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please generate a new one.'
      });
    }

    // Verify OTP
    if (task.serviceOtp !== parseInt(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    // Mark OTP as verified and update task status
    task.otpVerified = true;
    task.serviceOtp = undefined; // Clear OTP after verification
    task.serviceOtpExpiry = undefined;
    
    // Add tracking entry
    task.tracking.push({
      message: 'Service started after OTP verification',
      status: 'inProgress',
      date: new Date(),
      type: 'service_start'
    });

    await task.save();

    res.json({
      success: true,
      message: 'OTP verified successfully. Service can now be started.',
      data: task
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying OTP'
    });
  }
};

exports.completeService = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { notes, customerFeedback } = req.body;
    const partnerId = req.user.id;

    // Find the task
    const task = await Cart.findOne({ 
      _id: taskId, 
      assignedPartner: partnerId,
      status: 'inProgress'
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or not in progress'
      });
    }

    // Check if OTP was verified before allowing completion
    if (!task.otpVerified) {
      return res.status(400).json({
        success: false,
        message: 'Service cannot be completed without OTP verification. Please start the service first.'
      });
    }

    // Update task status to completed
    task.status = 'completed';
    task.completedAt = new Date();
    task.serviceNotes = notes;
    task.customerFeedback = customerFeedback;

    // Add tracking entry
    task.tracking.push({
      message: 'Service completed successfully',
      status: 'completed',
      date: new Date(),
      type: 'completion'
    });

    await task.save();

    // Trigger Pusher event for admin
    ably.channels.get("admin-channel").publish("task_updated", {
      message: `Task completed by partner`,
      taskId: task._id,
      status: 'completed'
    });

    // Notify User (Customer)
    ably.channels.get(`user-${task.userId}`).publish("order_status_updated", {
      message: `Your task is now completed`,
      taskId: task._id,
      status: 'completed'
    });

    // TODO: Send completion notification to user

    res.json({
      success: true,
      message: 'Service completed successfully',
      data: task
    });
  } catch (error) {
    console.error('Complete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing service'
    });
  }
};

exports.updateServiceStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, notes } = req.body;
    const partnerId = req.user.id;

    const validStatuses = ['inProgress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const task = await Cart.findOne({ 
      _id: taskId, 
      assignedPartner: partnerId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Special handling for completion status
    if (status === 'completed' && !task.otpVerified) {
      return res.status(400).json({
        success: false,
        message: 'Service cannot be completed without OTP verification. Please start the service first.'
      });
    }

    // Update task
    task.status = status;
    if (notes) task.serviceNotes = notes;

    if (status === 'completed') {
      task.completedAt = new Date();
    }

    // Add tracking entry
    task.tracking.push({
      message: `Status changed to ${status}`,
      status: status,
      date: new Date(),
      notes: notes
    });

    await task.save();

    // Trigger Pusher event for admin
    pusher.trigger("admin-channel", "task_updated", {
      message: `Task moved to ${status} by partner`,
      taskId: task._id,
      status: status
    });

    // Notify User (Customer)
    pusher.trigger(`user-${task.userId}`, "order_status_updated", {
      message: `Your task is now ${status}`,
      taskId: task._id,
      status: status
    });

    res.json({
      success: true,
      message: `Service ${status} successfully`,
      data: task
    });
  } catch (error) {
    console.error('Update service status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating service status'
    });
  }
};

// Soft Delete Partner
exports.softDeletePartner = async (req, res) => {
  try {
    const partnerId = req.params.id;
    const { deletedBy } = req.body;

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).send({ statusCode: 404, message: "Partner not found" });
    }

    partner.isDeleted = true;
    partner.deletedAt = new Date();
    partner.deletedBy = deletedBy || "Admin";
    
    await partner.save();

    res.status(200).send({
      statusCode: 200,
      message: "Partner moved to recycle bin successfully",
    });
  } catch (err) {
    res.status(500).send({ statusCode: 500, message: err.message });
  }
};

// Get Deleted Partners (Recycle Bin)
exports.getDeletedPartners = async (req, res) => {
  try {
    // Auto-cleanup: Permanently delete partners deleted > 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await Partner.deleteMany({
      isDeleted: true,
      deletedAt: { $lt: thirtyDaysAgo }
    });

    const deletedPartners = await Partner.find({ isDeleted: true }).sort({ deletedAt: -1 });

    res.status(200).send({
      statusCode: 200,
      message: "Deleted partners fetched successfully",
      data: deletedPartners
    });
  } catch (err) {
    res.status(500).send({ statusCode: 500, message: err.message });
  }
};

// Restore Partner
exports.restorePartner = async (req, res) => {
  try {
    const partnerId = req.params.id;

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).send({ statusCode: 404, message: "Partner not found" });
    }

    partner.isDeleted = false;
    partner.deletedAt = undefined;
    partner.deletedBy = undefined;

    await partner.save();

    res.status(200).send({
      statusCode: 200,
      message: "Partner restored successfully",
      data: partner
    });
  } catch (err) {
    res.status(500).send({ statusCode: 500, message: err.message });
  }
};