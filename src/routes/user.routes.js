const express = require('express');
const userController = require('../controllers/user.controller');
const multer = require('multer');
// Set up Multer for file upload handling
const storage = multer.memoryStorage(); // Store files in memory for easier uploading
const upload = multer({ storage });

const {authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const router = express.Router();



//base url
//   /api/users
router.post("/registration",  upload.single('image') , userController.userRegistration);
router.post("/login", userController.userLogin);
router.post("/verifyotp", userController.verifyOtp);

router.get("/profile", authMiddleware, userController.getUserProfile);

router.patch("/update/profile/:id",upload.single('image'), userController.updateUserProfile);








module.exports = router;
