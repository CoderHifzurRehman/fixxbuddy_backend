const ServiceType = require("../models/serviceType.model");

const {
  uploadSingleImageToS3,
  uploadMultipleImagesToS3,
} = require("../utils/uploadImages");

exports.createServiceType = async (req, res) => {
  try {
    const {applicationTypeId, serviceHeading, serviceName, serviceDescription, serviceCost, serviceDetails, serviceVideoLink } = req.body;

    // Check if a service with the same name already exists
    const existingServiceType = await ServiceType.findOne({ serviceName });
    // if (existingServiceType) {
    //   return res.status(400).send({
    //     statusCode: 400,
    //     message: "Service name already exists. Please choose a different name.",
    //   });
    // }

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).send({ message: "No images uploaded." });
    }
    const folderName = `services/serviceType/${serviceName}`; // Customize the folder name if needed
    // console.log(folderName);

    const serviceImage = await uploadMultipleImagesToS3(files, folderName);
    // console.log(imageUrl);

    // Proceed to create a new user
    const newserviceType = new ServiceType({
      applicationTypeId,
      serviceHeading,
      serviceName,
      serviceDescription,
      serviceImage,
      serviceCost,
      serviceDetails,
      serviceVideoLink
    });

    // Save the new user to the database
    const savedMainservices = await newserviceType.save();

    res.status(201).send({
      statusCode: 201,
      message: "Create Application Type successfully.",
      data: savedMainservices,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Update an existing main service
exports.updateServiceType = async (req, res) => {
  try {
    const { applicationTypeId, serviceName, serviceHeading, serviceDescription, serviceCost, serviceDetails, serviceVideoLink } = req.body;
    const serviceId = req.params.id; // Assuming you're using the service's ID for updates

    // Find the service by ID
    const service = await ServiceType.findById(serviceId);
    if (!service) {
      return res.status(404).send({
        statusCode: 404,
        message: "Application Type not found.",
      });
    }

    // Optionally update the image if a new one is uploaded
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).send({ message: "No images uploaded." });
    }

    const folderName = `services/serviceType/${serviceName}`;
    const serviceImages = await uploadMultipleImagesToS3(files, folderName); // returns array of URLs
    // Update the service data
    service.applicationTypeId = applicationTypeId || service.applicationTypeId;
    service.serviceHeading = serviceHeading || service.serviceHeading;
    service.serviceDescription = serviceDescription || service.serviceDescription;
    service.serviceName = serviceName || service.serviceName;
    service.serviceCost = serviceCost || service.serviceCost;
    service.serviceDetails = serviceDetails || service.serviceDetails;
    service.serviceVideoLink = serviceVideoLink || service.serviceVideoLink;
    service.serviceImage = serviceImages;

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
exports.getSingleServiceType= async (req, res) => {
  try {
    const serviceId = req.params.id; // Get the serviceId from the URL parameter

    // Find the service by its ID
    const service = await ServiceType.findById(serviceId);

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

//getServiceTypeList

exports.getServiceTypeList = async (req, res) => {
  try {
    const mainServiceCategorieId = req.params.id; // Get the mainServiceCategoryId from the URL parameter
    // Find the service by its ID
    const applicationtype = await ServiceType.find({ applicationTypeId : mainServiceCategorieId});

    if (!applicationtype) {
      return res.status(404).send({
        statusCode: 404,
        message: "Applicationtype not found.",
      });
    }

    // Send the service data in the response
    res.status(200).send({
      statusCode: 200,
      message: "Service categories retrieved successfully.",
      data: applicationtype,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};


// Get a single main service by service name
exports.getSingleServiceTypeByName = async (req, res) => {
  try {
    const serviceName = req.params.name; // Get the serviceName from the URL parameter

    // Find the service by its name
    const service = await ServiceType.findOne({ serviceName });

    if (!service) {
      return res.status(404).send({
        statusCode: 404,
        message: "Application Type not found.",
      });
    }

    // Send the service data in the response
    res.status(200).send({
      statusCode: 200,
      message: "Application Type retrieved successfully.",
      data: service,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

//deleteServices

exports.deleteServiceType = async (req, res) => {
  try {
    const mainServiceId = req.params.id;

    // Assuming you're using a MongoDB model called Mainservice
    const mainservice = await ServiceType.findById(mainServiceId);

    // Check if the vehicle exists
    if (!mainservice) {
      return res.status(404).send({
        statusCode: 404,
        message: "Mainservice not found",
      });
    }

    // Delete the mainService
    await ServiceType.deleteOne({ _id: mainServiceId });

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
exports.getAllServiceType = async (req, res) => {
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

    const data = await ServiceType.find(query)
      .sort(sorted)
      .skip(skip)
      .limit(limit)
      .lean();

    // Get the total count for pagination metadata
    const totalCount = await ServiceType.countDocuments(query);

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
