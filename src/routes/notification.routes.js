const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const notificationController = require('../controllers/notification.controller');

// All notification routes are protected
router.use(authMiddleware);

router.get('/', notificationController.getUserNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/clear-all', notificationController.clearAllNotifications);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
