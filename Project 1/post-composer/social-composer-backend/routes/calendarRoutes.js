const express = require('express');
const Post = require('../models/Post');
const auth = require('../middlewares/auth');

const router = express.Router();

// All calendar routes require a valid JWT
router.use(auth);

// ─── GET /api/calendar ────────────────────────────────────────────────────────
/**
 * Return scheduled posts for the calendar within a date range.
 * Query params: from, to (ISO strings)
 */
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;

    const query = {
      status: 'scheduled',
      ...(req.user.role === 'admin' ? {} : { authorId: req.user.id }),
    };

    if (from || to) {
      query.scheduledDate = {};
      if (from) query.scheduledDate.$gte = new Date(from);
      if (to) query.scheduledDate.$lte = new Date(to);
    }

    const posts = await Post.find(query)
      .sort({ scheduledDate: 1 })
      .populate('authorId', 'username')
      .lean();

    res.json(posts);
  } catch (err) {
    console.error('Get calendar error:', err);
    res.status(500).json({ message: 'Failed to fetch calendar events.' });
  }
});

module.exports = router;
