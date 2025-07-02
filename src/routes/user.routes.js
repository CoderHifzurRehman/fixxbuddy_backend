const express = require('express');
const userController = require('../controllers/user.controller');
const multer = require('multer');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

// Set up Multer for file upload handling
const storage = multer.memoryStorage(); // Store files in memory for easier uploading
const upload = multer({ storage });

// Base URL: /api/users

// Authentication routes
router.post("/registration", upload.single('image'), userController.userRegistration);
router.post("/login", userController.userLogin);
router.post("/verifyotp", userController.verifyOtp);

// Profile routes
router.get("/profile", authMiddleware, userController.getUserProfile);
router.patch("/update/profile/:id", authMiddleware, upload.single('image'), userController.updateUserProfile);

// Address management routes
router.post("/addresses", authMiddleware, userController.addAddress);
router.put("/addresses/:addressId", authMiddleware, userController.updateAddress);
router.delete("/addresses/:addressId", authMiddleware, userController.deleteAddress);
router.patch("/addresses/:addressId/set-primary", authMiddleware, userController.setPrimaryAddress);

// Contact number management routes
router.post("/contact-numbers", authMiddleware, userController.addContactNumber);
router.put("/contact-numbers/:contactId", authMiddleware, userController.updateContactNumber);
router.delete("/contact-numbers/:contactId", authMiddleware, userController.deleteContactNumber);
router.patch("/contact-numbers/:contactId/set-primary", authMiddleware, userController.setPrimaryContactNumber);


module.exports = router;