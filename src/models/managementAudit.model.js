const mongoose = require('mongoose');

const managementAuditSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'PROMOTED_TO_MANAGER',
        'PROMOTED_TO_TEAM_LEADER',
        'ROLE_CHANGED',
        'STATUS_TOGGLED',
        'TEAM_ASSIGNED',
        'CONFIG_UPDATED',
        'DEMOTED_TO_PARTNER',
        'PARTNER_ASSIGNED_TO_TEAM',
        'PARTNER_REMOVED_FROM_TEAM',
        'PARTNER_TRANSFERRED',
        'TEAM_MANAGER_CHANGED',
        'TEAM_STATUS_TOGGLED',
        'TEAM_LEADER_REASSIGNED',
        'TEAM_LEADER_SCOPE_UPDATED',
        'MANAGER_SCOPE_UPDATED',
        'JOB_ASSIGNED',
        'JOB_REASSIGNED',
        'JOB_STATUS_UPDATED',
        'JOB_RESCHEDULED',
        'PARTNER_AVAILABILITY_UPDATED'
      ]
    },
    performedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, default: 'Admin' },
      role: { type: String, default: 'admin' }
    },
    targetUser: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'partner', default: null },
      name: { type: String, default: '' },
      partnerId: { type: String, default: '' },
      role: { type: String, default: '' }
    },
    previousRole: {
      type: String,
      default: ''
    },
    newRole: {
      type: String,
      default: ''
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

const ManagementAudit = mongoose.model('ManagementAudit', managementAuditSchema);

module.exports = ManagementAudit;
