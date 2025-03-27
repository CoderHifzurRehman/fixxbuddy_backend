const express = require('express');
const partnerController = require('../controllers/partner.controller');
const multer = require('multer');
// Set up Multer for file upload handling
const storage = multer.memoryStorage(); // Store files in memory for easier uploading
const upload = multer({ storage });

const {authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const router = express.Router();



//base url
//   /api/users
router.post("/registration", partnerController.partnerRegistration);
router.post("/login", partnerController.partnerLogin);


module.exports = router;
