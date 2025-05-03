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
router.post("/create",  upload.single('image') , serviceTypeController.createServiceType);

router.get("/", serviceTypeController.getAllServiceType)

// Route to update an existing main service
router.put('/update/:id', upload.single('image'), serviceTypeController.updateServiceType);


// Route to get a single main service by ID
router.get('/:id', serviceTypeController.getSingleServiceType);

router.get('/list/:id', serviceTypeController.getServiceTypeList);

// Route to get a single main service by service name (alternative)
router.get('/name/:name', serviceTypeController.getSingleServiceTypeByName);

router.delete('/:id', serviceTypeController.deleteServiceType)






module.exports = router;
