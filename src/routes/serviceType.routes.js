const express = require('express');
const serviceTypeController = require('../controllers/serviceType.controller');
const multer = require('multer');
// Set up Multer for file upload handling
const storage = multer.memoryStorage(); // Store files in memory for easier uploading
const upload = multer({ storage });

const {authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const router = express.Router();



//base url
//   /api/mainservicesCategories
router.post(
  "/create", 
  upload.fields([
    { name: 'serviceImages', maxCount: 15 },  // Max 15 images
    { name: 'rateCardPdf', maxCount: 1 }      // Single PDF file
  ]), 
  serviceTypeController.createServiceType
);
// 'serviceImages' is the field name, 15 is the max number of images allowed

router.get("/", serviceTypeController.getAllServiceType)

// Route to update an existing main service
router.put(
  '/update/:id', 
  upload.fields([
    { name: 'serviceImages', maxCount: 15 },  // Max 15 images
    { name: 'rateCardPdf', maxCount: 1 }      // Single PDF file
  ]), 
  serviceTypeController.updateServiceType
);


// Route to get a single main service by ID
router.get('/:id', serviceTypeController.getSingleServiceType);

router.get('/list/:id', serviceTypeController.getServiceTypeList);

// Route to get a single main service by service name (alternative)
router.get('/name/:name', serviceTypeController.getSingleServiceTypeByName);

router.delete('/:id', serviceTypeController.deleteServiceType)


// NEW: Get service types by main service name with full hierarchy
router.get( '/hierarchy/:mainServiceName', serviceTypeController.getServiceTypesByMainServiceWithHierarchy);

// NEW: Get full service hierarchy (for admin panel)
router.get( '/hierarchy/full/tree', authMiddleware, authorizeRoles('admin'), serviceTypeController.getFullServiceHierarchy);




module.exports = router;
