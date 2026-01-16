const ServiceType = require("../models/serviceType.model");
const ApplicationType = require("../models/applicationType.model");
const MainServicesCategories = require("../models/mainServicesCategories.model");
const Mainservices = require("../models/mainServices.model");

const {
  uploadSingleImageToS3,
  uploadMultipleImagesToS3,
} = require("../utils/uploadImages");

exports.createServiceType = async (req, res) => {
  console.log('Received files:', req.files);
  try {
    const {applicationTypeId, serviceHeading, serviceName, serviceDescription, serviceCost, serviceDetails, serviceVideoLink,  discountPercentage, discountValidUntil, discountTerms } = req.body;

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
      return res.status(400).send({ message: "No files uploaded." });
    }
    const folderName = `services/serviceType/${serviceName}`; // Customize the folder name if needed
    // console.log(folderName);

    // Handle service images
    let serviceImages = [];
    if (files.serviceImages && files.serviceImages.length > 0) {
      serviceImages = await uploadMultipleImagesToS3(files.serviceImages, folderName);
    }

    // Handle rate card PDF
    let rateCardPdfUrl = '';
    if (files.rateCardPdf && files.rateCardPdf[0]) {
      rateCardPdfUrl = await uploadSingleImageToS3(files.rateCardPdf[0], `${folderName}/rateCard`);
    }
    // Proceed to create a new user
    const newserviceType = new ServiceType({
      applicationTypeId,
      serviceHeading,
      serviceName,
      serviceDescription,
      serviceImage: serviceImages,
      serviceCost,
      serviceDetails,
      serviceVideoLink,
      discountPercentage: discountPercentage || 0,
      discountValidUntil: discountValidUntil || null,
      discountTerms: discountTerms || '',
      rateCardPdf: rateCardPdfUrl
    });

    // Save the new user to the database
    const savedServiceType = await newserviceType.save();

    res.status(201).send({
      statusCode: 201,
      message: "Create Service Type successfully.",
      data: savedServiceType,
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// Update an existing main service
exports.updateServiceType = async (req, res) => {
  try {
    const { applicationTypeId, serviceName, serviceHeading, serviceDescription, serviceCost, serviceDetails, serviceVideoLink, discountPercentage, discountValidUntil, discountTerms } = req.body;
    const serviceId = req.params.id; // Assuming you're using the service's ID for updates

    // Find the service by ID
    const service = await ServiceType.findById(serviceId);
    if (!service) {
      return res.status(404).send({
        statusCode: 404,
        message: "Service Type not found.",
      });
    }

    // Handle image uploads
    const files = req.files || {};
    let serviceImages = service.serviceImage;
    let rateCardPdf = service.rateCardPdf;

    if (files.serviceImages) {
      const folderName = `services/serviceType/${serviceName || service.serviceName}`;
      serviceImages = await uploadMultipleImagesToS3(files.serviceImages, folderName);
    }

    if (files.rateCardPdf) {
      const folderName = `services/serviceType/${serviceName || service.serviceName}`;
      rateCardPdf = await uploadSingleImageToS3(files.rateCardPdf[0], `${folderName}/rateCard`);
    }

    // Update the service data
    service.applicationTypeId = applicationTypeId || service.applicationTypeId;
    service.serviceHeading = serviceHeading || service.serviceHeading;
    service.serviceDescription = serviceDescription || service.serviceDescription;
    service.serviceName = serviceName || service.serviceName;
    service.serviceCost = serviceCost || service.serviceCost;
    service.serviceDetails = serviceDetails || service.serviceDetails;
    service.serviceVideoLink = serviceVideoLink || service.serviceVideoLink;
    service.serviceImage = serviceImages;
    service.discountPercentage = discountPercentage || service.discountPercentage;
    service.discountValidUntil = discountValidUntil || service.discountValidUntil;
    service.discountTerms = discountTerms || service.discountTerms;
    service.rateCardPdf = rateCardPdf;

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

// Add this to your serviceType.controller.js
exports.getAllServiceTypes = async (req, res) => {
  try {
    const serviceTypes = await ServiceType.find({})
      .populate('applianceTypeId')
      .populate('mainServiceId');

    res.status(200).json({
      success: true,
      data: serviceTypes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching all service types',
      error: error.message
    });
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
// NEW: Get service types by main service name with full hierarchy
exports.getServiceTypesByMainServiceWithHierarchy = async (req, res) => {
  try {
    const mainServiceName = req.params.mainServiceName;

    // 1. Find the main service by name
    const mainService = await Mainservices.findOne({ 
      serviceName: mainServiceName,
      isActive: true 
    });
    
    if (!mainService) {
      return res.status(404).send({
        statusCode: 404,
        message: "Main service not found.",
      });
    }

    // 2. Find all active categories for this main service
    const categories = await MainServicesCategories.find({ 
      mainServiceId: mainService._id,
      isActive: true 
    });

    // 3. Find all active application types for these categories
    const categoryIds = categories.map(c => c._id);
    const applicationTypes = await ApplicationType.find({ 
      mainServiceCategoriesId: { $in: categoryIds },
      isActive: true 
    });

    // 4. Find all active service types for these application types
    const applicationTypeIds = applicationTypes.map(a => a._id);
    const serviceTypes = await ServiceType.find({ 
      applicationTypeId: { $in: applicationTypeIds },
      isActive: true 
    });

    // Build the response with hierarchy
    const response = serviceTypes.map(serviceType => {
      const applicationType = applicationTypes.find(a => 
        a._id.equals(serviceType.applicationTypeId)
      );
      const category = categories.find(c => 
        c._id.equals(applicationType.mainServiceCategoriesId)
      );
      
      return {
        serviceType,
        hierarchy: {
          mainService: {
            id: mainService._id,
            name: mainService.serviceName,
            heading: mainService.serviceHeading
          },
          category: {
            id: category._id,
            name: category.serviceName,
            heading: category.serviceHeading
          },
          applicationType: {
            id: applicationType._id,
            name: applicationType.serviceName,
            heading: applicationType.serviceHeading
          }
        }
      };
    });

    // Set cache control header for 5 minutes
    res.set('Cache-Control', 'public, max-age=300');

    res.status(200).send({
      statusCode: 200,
      message: "Service types retrieved with hierarchy successfully.",
      data: response
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// NEW: Get service types by multiple main service names with full hierarchy
exports.getBulkServiceTypesWithHierarchy = async (req, res) => {
  try {
    const { mainServiceNames } = req.body;

    if (!mainServiceNames || !Array.isArray(mainServiceNames)) {
      return res.status(400).send({
        statusCode: 400,
        message: "Invalid request. mainServiceNames must be an array.",
      });
    }

    // 1. Find all active main services by names
    const mainServices = await Mainservices.find({ 
      serviceName: { $in: mainServiceNames },
      isActive: true 
    });
    
    if (mainServices.length === 0) {
      return res.status(404).send({
        statusCode: 404,
        message: "No matching main services found.",
      });
    }

    const mainServiceIds = mainServices.map(ms => ms._id);

    // 2. Find all active categories for these main services
    const categories = await MainServicesCategories.find({ 
      mainServiceId: { $in: mainServiceIds },
      isActive: true 
    });

    // 3. Find all active application types for these categories
    const categoryIds = categories.map(c => c._id);
    const applicationTypes = await ApplicationType.find({ 
      mainServiceCategoriesId: { $in: categoryIds },
      isActive: true 
    });

    // 4. Find all active service types for these application types
    const applicationTypeIds = applicationTypes.map(a => a._id);
    const serviceTypes = await ServiceType.find({ 
      applicationTypeId: { $in: applicationTypeIds },
      isActive: true 
    });

    // Build the response with hierarchy organized by main service name
    const response = {};
    
    mainServiceNames.forEach(msName => {
      const ms = mainServices.find(m => m.serviceName === msName);
      if (!ms) return;

      const msCategories = categories.filter(c => c.mainServiceId.equals(ms._id));
      const msCategoryIds = msCategories.map(c => c._id);
      
      const msAppTypes = applicationTypes.filter(at => 
        msCategoryIds.some(catId => at.mainServiceCategoriesId.equals(catId))
      );
      const msAppTypeIds = msAppTypes.map(at => at._id);
      
      const msServiceTypes = serviceTypes.filter(st => 
        msAppTypeIds.some(atId => st.applicationTypeId.equals(atId))
      );

      response[msName] = msServiceTypes.map(serviceType => {
        const applicationType = msAppTypes.find(a => 
          a._id.equals(serviceType.applicationTypeId)
        );
        const category = msCategories.find(c => 
          c._id.equals(applicationType.mainServiceCategoriesId)
        );
        
        return {
          serviceType,
          hierarchy: {
            mainService: {
              id: ms._id,
              name: ms.serviceName,
              heading: ms.serviceHeading
            },
            category: {
              id: category._id,
              name: category.serviceName,
              heading: category.serviceHeading
            },
            applicationType: {
              id: applicationType._id,
              name: applicationType.serviceName,
              heading: applicationType.serviceHeading
            }
          }
        };
      });
    });

    // Set cache control header for 5 minutes
    res.set('Cache-Control', 'public, max-age=300');

    res.status(200).send({
      statusCode: 200,
      message: "Bulk service types retrieved with hierarchy successfully.",
      data: response
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};

// NEW: Get full hierarchy tree (for admin panel or other uses)
exports.getFullServiceHierarchy = async (req, res) => {
  try {
    const mainServices = await Mainservices.find({ isActive: true });
    
    const hierarchy = await Promise.all(
      mainServices.map(async (mainService) => {
        const categories = await MainServicesCategories.find({
          mainServiceId: mainService._id,
          isActive: true
        });
        
        const categoriesWithTypes = await Promise.all(
          categories.map(async (category) => {
            const applicationTypes = await ApplicationType.find({
              mainServiceCategoriesId: category._id,
              isActive: true
            });
            
            const applicationTypesWithServices = await Promise.all(
              applicationTypes.map(async (appType) => {
                const serviceTypes = await ServiceType.find({
                  applicationTypeId: appType._id,
                  isActive: true
                });
                return {
                  ...appType.toObject(),
                  serviceTypes
                };
              })
            );
            
            return {
              ...category.toObject(),
              applicationTypes: applicationTypesWithServices
            };
          })
        );
        
        return {
          ...mainService.toObject(),
          categories: categoriesWithTypes
        };
      })
    );
    
    res.status(200).send({
      statusCode: 200,
      message: "Full service hierarchy retrieved successfully.",
      data: hierarchy
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};