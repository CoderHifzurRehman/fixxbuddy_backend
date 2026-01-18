const express = require('express');
const applicationTypeController = require('../controllers/applicationType.controller');
const multer = require('multer');
const upload = require('../middlewares/upload');

const {authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const router = express.Router();



//base url
//   /api/mainservicesCategories
router.post("/create",  upload.single('image') , applicationTypeController.createApplicationType);

router.get("/", applicationTypeController.getAllApplicationType)

// Route to update an existing main service
router.put('/update/:id', upload.single('image'), applicationTypeController.updateApplicationType);


// Route to get a single main service by ID
router.get('/:id', applicationTypeController.getSingleApplicationType);

router.get('/list/:id', applicationTypeController.getApplicationTypeList);

// Route to get a single main service by service name (alternative)
router.get('/name/:name', applicationTypeController.getSingleApplicationTypeByName);

router.delete('/:id', applicationTypeController.deleteApplicationType)






module.exports = router;
