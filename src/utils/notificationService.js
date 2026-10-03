const Notification = require('../models/notification.model');
const ably = require('./ably');
const { sendPushToUser } = require('./fcm');

/**
 * Creates an in-app notification in DB, broadcasts via Ably real-time,
 * and optionally sends mobile push notification via FCM.
 */
async function createNotification({
  userId,
  title,
  message,
  type = 'general',
  link = '/orders',
  metadata = {},
  sendPush = true
}) {
  if (!userId || !title || !message) {
    console.warn('[NotificationService] Missing required fields: userId, title, or message');
    return null;
  }

  try {
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      link,
      metadata,
      isRead: false
    });

    // 1. Broadcast via Ably real-time channel to user
    try {
      if (ably && ably.channels) {
        const channelName = 'user-' + userId.toString();
        const userChannel = ably.channels.get(channelName);
        userChannel.publish('notification_received', {
          _id: notification._id,
          userId: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          link: notification.link,
          metadata: notification.metadata,
          isRead: notification.isRead,
          createdAt: notification.createdAt
        });
      }
    } catch (ablyErr) {
      console.warn('[NotificationService] Ably broadcast failed:', ablyErr.message);
    }

    // 2. Optionally send mobile FCM push notification
    if (sendPush) {
      try {
        const extraData = {
          route: link || '/orders',
          type: type || 'general',
          orderId: String(metadata.orderId || metadata.orderDbId || '')
        };
        if (metadata && typeof metadata === 'object') {
          for (const [k, v] of Object.entries(metadata)) {
            extraData[k] = String(v ?? '');
          }
        }

        await sendPushToUser(userId, {
          title,
          body: message,
          data: extraData
        });
      } catch (fcmErr) {
        console.warn('[NotificationService] FCM push failed:', fcmErr.message);
      }
    }

    return notification;
  } catch (error) {
    console.error('[NotificationService] Failed to create notification:', error);
    return null;
  }
}

module.exports = {
  createNotification
};
