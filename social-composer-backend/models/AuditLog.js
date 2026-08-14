const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      // e.g., 'DEACTIVATE_USER', 'CHANGE_ROLE', 'CANCEL_POST'
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId, // Could be a User ID or Post ID
      required: true,
    },
    targetModel: {
      type: String,
      required: true,
      enum: ['User', 'Post'],
    },
    details: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
