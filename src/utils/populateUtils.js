// Utility functions for populating service hierarchies
exports.populateServiceHierarchy = async (serviceTypeId) => {
  const serviceType = await ServiceType.findById(serviceTypeId)
    .populate({
      path: 'applicationTypeId',
      populate: {
        path: 'mainServiceCategoriesId',
        populate: {
          path: 'mainServiceId'
        }
      }
    });
  
  if (!serviceType) return null;
  
  return {
    serviceType,
    hierarchy: {
      mainService: serviceType.applicationTypeId.mainServiceCategoriesId.mainServiceId,
      category: serviceType.applicationTypeId.mainServiceCategoriesId,
      applicationType: serviceType.applicationTypeId
    }
  };
};

exports.populateFullHierarchy = async () => {
  return await Mainservices.find({ isActive: true })
    .populate({
      path: 'categories',
      match: { isActive: true },
      populate: {
        path: 'applicationTypes',
        match: { isActive: true },
        populate: {
          path: 'serviceTypes',
          match: { isActive: true }
        }
      }
    });
};