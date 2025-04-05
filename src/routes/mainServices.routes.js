const express = require('express');
const mainServicesController = require('../controllers/mainServices.controller');
const multer = require('multer');
// Set up Multer for file upload handling
const storage = multer.memoryStorage(); // Store files in memory for easier uploading
const upload = multer({ storage });

const {authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const router = express.Router();



//base url
//   /api/mainservices
router.post("/create",  upload.single('image') , mainServicesController.createMainService);

router.get("/", mainServicesController.getAllServices)

// Route to update an existing main service
router.put('/update/:id', upload.single('file'), mainServicesController.updateMainService);


// Route to get a single main service by ID
router.get('/:id', mainServicesController.getSingleMainService);

// Route to get a single main service by service name (alternative)
router.get('/name/:name', mainServicesController.getSingleMainServiceByName);

router.delete('/:id', mainServicesController.deleteMainServices)






module.exports = router;
