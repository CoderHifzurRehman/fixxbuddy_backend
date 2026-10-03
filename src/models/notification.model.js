const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: [
        'partner_assigned',
        'partner_reassigned',
        'order_status',
        'order_placed',
        'quotation',
        'service_started',
        'service_completed',
        'payment_received',
        'general'
      ],
      default: 'general',
      index: true
    },
    link: {
      type: String,
      default: '/orders'
    },
    metadata: {
      orderId: { type: String, default: '' },
      orderDbId: { type: String, default: '' },
      partnerId: { type: String, default: '' },
      partnerName: { type: String, default: '' },
      partnerPhone: { type: String, default: '' },
      status: { type: String, default: '' },
      quotationId: { type: String, default: '' },
      extra: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
