const express = require('express');
const expertiseController = require('../controllers/expertise.controller');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

// Get all expertises (accessible by any logged-in user)
router.get("/", authMiddleware, expertiseController.getAllExpertises);

// Manage expertises (accessible only by admin and subadmin)
router.post("/", authMiddleware, authorizeRoles('admin', 'subadmin'), expertiseController.createExpertise);
router.put("/:id", authMiddleware, authorizeRoles('admin', 'subadmin'), expertiseController.updateExpertise);
router.delete("/:id", authMiddleware, authorizeRoles('admin', 'subadmin'), expertiseController.deleteExpertise);

module.exports = router;
