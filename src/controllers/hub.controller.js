const Hub = require("../models/hub.model");

// Create a new hub
exports.createHub = async (req, res) => {
  try {
    const { name, pincodes, managerId } = req.body;

    const existingHub = await Hub.findOne({ name });
    if (existingHub) {
      return res.status(409).send({
        statusCode: 409,
        message: "Hub with this name already exists.",
      });
    }

    const newHub = new Hub({
      name,
      pincodes,
      managerId: (managerId && managerId.trim() !== "") ? managerId : null,
    });

    const savedHub = await newHub.save();

    res.status(201).send({
      statusCode: 201,
      message: "Hub created successfully.",
      data: savedHub,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error creating hub",
    });
  }
};

// Get all hubs
exports.getAllHubs = async (req, res) => {
  try {
    const hubs = await Hub.find().populate("managerId", "firstName lastName email");
    res.status(200).send({
      statusCode: 200,
      message: "Hubs retrieved successfully.",
      data: hubs,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error fetching hubs",
    });
  }
};

// Update a hub
exports.updateHub = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, pincodes, managerId, isActive } = req.body;

    const hub = await Hub.findById(id);
    if (!hub) {
      return res.status(404).send({
        statusCode: 404,
        message: "Hub not found.",
      });
    }

    if (name) hub.name = name;
    if (pincodes) hub.pincodes = pincodes;
    if (managerId !== undefined) hub.managerId = (managerId && managerId.trim() !== "") ? managerId : null;
    if (isActive !== undefined) hub.isActive = isActive;

    const updatedHub = await hub.save();

    res.status(200).send({
      statusCode: 200,
      message: "Hub updated successfully.",
      data: updatedHub,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error updating hub",
    });
  }
};

// Delete a hub
exports.deleteHub = async (req, res) => {
  try {
    const { id } = req.params;
    const hub = await Hub.findByIdAndDelete(id);
    if (!hub) {
      return res.status(404).send({
        statusCode: 404,
        message: "Hub not found.",
      });
    }
    res.status(200).send({
      statusCode: 200,
      message: "Hub deleted successfully.",
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error deleting hub",
    });
  }
};

// Check serviceability of a pincode
exports.checkServiceability = async (req, res) => {
  try {
    const { pincode } = req.params;
    if (!pincode) {
      return res.status(400).send({
        statusCode: 400,
        message: "Pincode is required.",
      });
    }

    const hub = await Hub.findOne({ 
      pincodes: pincode,
      isActive: true 
    });

    if (hub) {
      return res.status(200).send({
        statusCode: 200,
        success: true,
        message: "Pincode is serviceable.",
        data: {
          hubName: hub.name,
          serviceable: true
        }
      });
    } else {
      return res.status(200).send({
        statusCode: 200,
        success: false,
        message: "Pincode is not serviceable.",
        data: {
          serviceable: false
        }
      });
    }
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error checking serviceability",
    });
  }
};
