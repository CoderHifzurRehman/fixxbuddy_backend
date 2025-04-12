const express = require('express');
const mainServicesCategoriesController = require('../controllers/mainServicesCategories.controller');
const multer = require('multer');
// Set up Multer for file upload handling
const storage = multer.memoryStorage(); // Store files in memory for easier uploading
const upload = multer({ storage });

const {authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const router = express.Router();



//base url
//   /api/mainservicesCategories
router.post("/create",  upload.single('image') , mainServicesCategoriesController.createMainServiceCategories);

router.get("/", mainServicesCategoriesController.getAllServices)

// Route to update an existing main service
router.put('/update/:id', upload.single('file'), mainServicesCategoriesController.updateMainServiceCategories);


// Route to get a single main service by ID
router.get('/:id', mainServicesCategoriesController.getSingleMainServiceCategories);

// Route to get a single main service by service name (alternative)
router.get('/name/:name', mainServicesCategoriesController.getSingleMainServiceCategoriesByName);

router.delete('/:id', mainServicesCategoriesController.deleteMainServicesCategories)






module.exports = router;
