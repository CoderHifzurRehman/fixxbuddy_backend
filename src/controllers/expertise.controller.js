const Expertise = require("../models/expertise.model");

// Create a new expertise
exports.createExpertise = async (req, res) => {
  try {
    const { name, mappedServices } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).send({
        statusCode: 400,
        message: "Expertise name is required.",
      });
    }

    const existingExpertise = await Expertise.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") } 
    });
    if (existingExpertise) {
      return res.status(409).send({
        statusCode: 409,
        message: "An expertise with this name already exists.",
      });
    }

    const newExpertise = new Expertise({
      name: name.trim(),
      mappedServices: mappedServices || [],
    });

    const savedExpertise = await newExpertise.save();

    res.status(201).send({
      statusCode: 201,
      message: "Expertise created successfully.",
      data: savedExpertise,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error creating expertise",
    });
  }
};

// Get all expertises
exports.getAllExpertises = async (req, res) => {
  try {
    const expertises = await Expertise.find().sort({ name: 1 });
    res.status(200).send({
      statusCode: 200,
      message: "Expertises retrieved successfully.",
      data: expertises,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error fetching expertises",
    });
  }
};

// Update an expertise
exports.updateExpertise = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mappedServices } = req.body;

    const expertise = await Expertise.findById(id);
    if (!expertise) {
      return res.status(404).send({
        statusCode: 404,
        message: "Expertise not found.",
      });
    }

    if (name) {
      const existingExpertise = await Expertise.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
        _id: { $ne: id }
      });
      if (existingExpertise) {
        return res.status(409).send({
          statusCode: 409,
          message: "Another expertise with this name already exists.",
        });
      }
      expertise.name = name.trim();
    }

    if (mappedServices !== undefined) {
      expertise.mappedServices = mappedServices;
    }

    const updatedExpertise = await expertise.save();

    res.status(200).send({
      statusCode: 200,
      message: "Expertise updated successfully.",
      data: updatedExpertise,
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error updating expertise",
    });
  }
};

// Delete an expertise
exports.deleteExpertise = async (req, res) => {
  try {
    const { id } = req.params;
    const expertise = await Expertise.findByIdAndDelete(id);
    if (!expertise) {
      return res.status(404).send({
        statusCode: 404,
        message: "Expertise not found.",
      });
    }
    res.status(200).send({
      statusCode: 200,
      message: "Expertise deleted successfully.",
    });
  } catch (err) {
    res.status(500).send({
      statusCode: 500,
      message: err.message || "Error deleting expertise",
    });
  }
};
