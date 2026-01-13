const express = require('express');
const partnerController = require('../controllers/partner.controller');
const multer = require('multer');
// Set up Multer for file upload handling
const storage = multer.memoryStorage(); // Store files in memory for easier uploading
const upload = multer({ storage });

const {authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const router = express.Router();



//base url
//   /api/partners
router.post("/registration", partnerController.partnerRegistration);

router.patch("/profile/update/:id", partnerController.updateProfile);

router.post('/upload/images/:id', upload.fields([
    { name: 'profilePic', maxCount: 1 },
    { name: 'aadharFrontPic', maxCount: 1 },
    { name: 'aadharBackPic', maxCount: 1 },
    { name: 'PanPic', maxCount: 1 },
    { name: 'pcc', maxCount: 1 }
  ]), partnerController.uploadImages);

router.post("/login", partnerController.partnerLogin);


// Partner Management
router.patch("/:id/soft-delete", partnerController.softDeletePartner);
router.get("/deleted", partnerController.getDeletedPartners);
router.patch("/:id/restore", partnerController.restorePartner);
router.delete("/:id", partnerController.softDeletePartner); // Keep delete verb but use soft delete logic

router.put("/:id", partnerController.updateProfile);

router.get("/single/:id", partnerController.getSinglePartner);



//get all partner
router.get("/", partnerController.getAllPartenrs);

// ADD THESE NEW ROUTES FOR DASHBOARD
router.get("/dashboard", authMiddleware, partnerController.getPartnerDashboard);
router.patch("/tasks/:taskId/status", authMiddleware, partnerController.updateTaskStatus);

// Add to your partner routes
router.patch('/tasks/:taskId/start-service', authMiddleware, partnerController.startService);
router.post('/tasks/:taskId/verify-otp', authMiddleware, partnerController.verifyServiceOtp);
router.patch('/tasks/:taskId/complete', authMiddleware, partnerController.completeService);
router.patch('/tasks/:taskId/status', authMiddleware, partnerController.updateServiceStatus);

module.exports = router;
