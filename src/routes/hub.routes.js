const express = require('express');
const hubController = require('../controllers/hub.controller');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes
router.get("/check/:pincode", hubController.checkServiceability);

// Admin/Subadmin routes
router.get("/", authMiddleware, authorizeRoles('admin', 'subadmin'), hubController.getAllHubs);
router.post("/", authMiddleware, authorizeRoles('admin', 'subadmin'), hubController.createHub);
router.put("/:id", authMiddleware, authorizeRoles('admin', 'subadmin'), hubController.updateHub);
router.delete("/:id", authMiddleware, authorizeRoles('admin', 'subadmin'), hubController.deleteHub);

module.exports = router;
