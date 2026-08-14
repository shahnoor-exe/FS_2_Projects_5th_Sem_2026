const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const AuditLog = require('../models/AuditLog');
const auth = require('../middlewares/auth');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(auth);
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
});

// ─── GET /api/admin/metrics ───────────────────────────────────────────────────
router.get('/metrics', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    
    const totalPosts = await Post.countDocuments();
    const draftCount = await Post.countDocuments({ status: 'draft' });
    const scheduledCount = await Post.countDocuments({ status: 'scheduled' });
    const publishedCount = await Post.countDocuments({ status: 'published' });
    const failedCount = await Post.countDocuments({ status: 'failed' });
    const cancelledCount = await Post.countDocuments({ status: 'cancelled' });

    res.json({
      totalUsers,
      activeUsers,
      totalPosts,
      draftCount,
      scheduledCount,
      publishedCount,
      failedCount,
      cancelledCount,
    });
  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).json({ message: 'Failed to load metrics.' });
  }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ message: 'Failed to load users.' });
  }
});

// ─── PATCH /api/admin/users/:id/status ────────────────────────────────────────
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot deactivate yourself.' });
    }

    user.isActive = Boolean(isActive);
    await user.save();

    await AuditLog.create({
      adminId: req.user.id,
      action: user.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      targetId: user._id,
      targetModel: 'User',
      details: `Admin ${user.isActive ? 'activated' : 'deactivated'} user ${user.username}.`
    });

    res.json({ message: 'User status updated successfully.', user: { id: user._id, isActive: user.isActive } });
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ message: 'Failed to update user status.' });
  }
});

// ─── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'editor'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own role.' });
    }

    user.role = role;
    await user.save();

    await AuditLog.create({
      adminId: req.user.id,
      action: 'CHANGE_ROLE',
      targetId: user._id,
      targetModel: 'User',
      details: `Admin changed role of ${user.username} to ${role}.`
    });

    res.json({ message: 'User role updated successfully.', user: { id: user._id, role: user.role } });
  } catch (err) {
    console.error('Update user role error:', err);
    res.status(500).json({ message: 'Failed to update user role.' });
  }
});

// ─── GET /api/admin/audit-logs ────────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .populate('adminId', 'username')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(logs);
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ message: 'Failed to load logs.' });
  }
});

module.exports = router;
