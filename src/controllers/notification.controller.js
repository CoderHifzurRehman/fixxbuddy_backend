const Notification = require('../models/notification.model');

// @desc    Get current user notifications with unread count & read/unread filtering
// @route   GET /api/notifications
// @access  Private (User)
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { status, page = 1, limit = 50 } = req.query;

    const query = { userId };
    if (status === 'unread') {
      query.isRead = false;
    } else if (status === 'read') {
      query.isRead = true;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [notifications, totalCount, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId, isRead: false })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        totalCount,
        unreadCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
};

// @desc    Mark single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private (User)
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification,
      unreadCount
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update notification',
      error: error.message
    });
  }
};

// @desc    Mark all user notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private (User)
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      unreadCount: 0
    });
  } catch (error) {
    console.error('Error marking all as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read',
      error: error.message
    });
  }
};

// @desc    Delete single notification
// @route   DELETE /api/notifications/:id
// @access  Private (User)
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const deleted = await Notification.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
      unreadCount
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
};

// @desc    Clear all notifications for user
// @route   DELETE /api/notifications/clear-all
// @access  Private (User)
exports.clearAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    await Notification.deleteMany({ userId });

    return res.status(200).json({
      success: true,
      message: 'All notifications cleared',
      unreadCount: 0
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear notifications',
      error: error.message
    });
  }
};
