const MainservicesCategories = require("../models/mainServicesCategories.model");

const {
  uploadSingleImageToS3,
  uploadMultipleImagesToS3,
} = require("../utils/uploadImages");

exports.createMainServiceCategories = async (req, res) => {
  try {
    const {mainServiceId, serviceHeading, isModalOpen, serviceName, serviceDescription } = req.body;

    // Check if a service with the same name already exists
    const existingService = await MainservicesCategories.findOne({ serviceName });
    if (existingService) {
      return res.status(400).send({
        statusCode: 400,
        message: "Service name already exists. Please choose a different name.",
      });
    }

    const { file } = req;
    if (!file) {
      return res.status(400).send("No file uploaded.");
    }
    const folderName = `partner/mainservicesCategories/${serviceName}`; // Customize the folder name if needed
    // console.log(folderName);

    const serviceImage = await uploadSingleImageToS3(file, folderName);
    // console.log(imageUrl);

    // Proceed to create a new user
    const newMainservicesCategories = new MainservicesCategories({
      mainServiceId,
      isModalOpen,
      serviceHeading,
      serviceName,
      serviceDescription,
      serviceImage,
    });

    // Save the new user to the database
    const savedMainservices = await newMainservicesCategories.save();

    res.status(201).send({
      statusCode: 201,
      message: "Create main service successfully.",
      data: savedMainservices,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Update an existing main service
exports.updateMainServiceCategories = async (req, res) => {
  try {
    const { mainServiceId, isModalOpen, serviceName, serviceHeading, serviceDescription } = req.body;
    const serviceId = req.params.id; // Assuming you're using the service's ID for updates

    // Find the service by ID
    const service = await MainservicesCategories.findById(serviceId);
    if (!service) {
      return res.status(404).send({
        statusCode: 404,
        message: "Service not found.",
      });
    }

    // Optionally update the image if a new one is uploaded
    const { file } = req;
    let serviceImage = service.serviceImage; // Keep the existing image unless a new one is uploaded

    if (file) {
      const folderName = `partner/mainservicesCategories/${serviceName}`;
      serviceImage = await uploadSingleImageToS3(file, folderName);
    }

    // Update the service data
    service.mainServiceId = mainServiceId || service.mainServiceId;
    service.isModalOpen = isModalOpen || service.isModalOpen;
    service.serviceHeading = serviceHeading || service.serviceHeading;
    service.serviceDescription = serviceDescription || service.serviceDescription;
    service.serviceName = serviceName || service.serviceName;
    service.serviceImage = serviceImage;

    // Save the updated service
    const updatedService = await service.save();

    res.status(200).send({
      statusCode: 200,
      message: "Service updated successfully.",
      data: updatedService,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Get a single main service by service ID
exports.getSingleMainServiceCategories = async (req, res) => {
  try {
    const serviceId = req.params.id; // Get the serviceId from the URL parameter

    // Find the service by its ID
    const service = await MainservicesCategories.findById(serviceId);

    if (!service) {
      return res.status(404).send({
        statusCode: 404,
        message: "Service not found.",
      });
    }

    // Send the service data in the response
    res.status(200).send({
      statusCode: 200,
      message: "Service retrieved successfully.",
      data: service,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

//getMainServiceCategoriesList

exports.getMainServiceCategoriesList = async (req, res) => {
  try {
    const serviceId = req.params.id; // Get the serviceId from the URL parameter

    // Find the service by its ID
    const servicecategories = await MainservicesCategories.find({ mainServiceId : serviceId});

    if (!servicecategories) {
      return res.status(404).send({
        statusCode: 404,
        message: "Service categories not found.",
      });
    }

    // Send the service data in the response
    res.status(200).send({
      statusCode: 200,
      message: "Service categories retrieved successfully.",
      data: servicecategories,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};


// Get a single main service by service name
exports.getSingleMainServiceCategoriesByName = async (req, res) => {
  try {
    const serviceName = req.params.name; // Get the serviceName from the URL parameter

    // Find the service by its name
    const service = await MainservicesCategories.findOne({ serviceName });

    if (!service) {
      return res.status(404).send({
        statusCode: 404,
        message: "Service not found.",
      });
    }

    // Send the service data in the response
    res.status(200).send({
      statusCode: 200,
      message: "Service retrieved successfully.",
      data: service,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

//deleteServices

exports.deleteMainServicesCategories = async (req, res) => {
  try {
    const mainServiceId = req.params.id;

    // Assuming you're using a MongoDB model called Mainservice
    const mainservice = await MainservicesCategories.findById(mainServiceId);

    // Check if the vehicle exists
    if (!mainservice) {
      return res.status(404).send({
        statusCode: 404,
        message: "Mainservice not found",
      });
    }

    // Delete the mainService
    await MainservicesCategories.deleteOne({ _id: mainServiceId });

    res.status(200).send({
      statusCode: 200,
      message: "mainservice deleted successfully",
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

//get all services
exports.getAllServices = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const sorted = { createdAt: -1 };
    const query = {
      // userId: req.user.id,
    };
    const services = await exports.MainServicesPagination(
      page,
      limit,
      sorted,
      query
    );

    // console.log(services);
    if (services.data.length === 0) {
      return res.status(404).send({
        statusCode: 404,
        message: "No services found for this criteria",
      });
    }

    res.status(200).send({
      statusCode: 200,
      message: "Main Servies fetch successfully",
      pagination: services.pagination,
      data: services.data,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

exports.MainServicesPagination = async (page, limit, sorted, query) => {
  try {
    const skip = (page - 1) * limit;

    const data = await MainservicesCategories.find(query)
      .sort(sorted)
      .skip(skip)
      .limit(limit)
      .lean();

    // Get the total count for pagination metadata
    const totalCount = await MainservicesCategories.countDocuments(query);

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
