const express = require('express');
const Post = require('../models/Post');
const auth = require('../middlewares/auth');
const { upload, cloudinary } = require('../middlewares/upload');

const router = express.Router();

// All post routes require a valid JWT
router.use(auth);

// ─── GET /api/posts ───────────────────────────────────────────────────────────
/**
 * Return all posts belonging to the logged-in user, newest first.
 */
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find({ authorId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(posts);
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ message: 'Failed to fetch posts.' });
  }
});

// ─── POST /api/posts ──────────────────────────────────────────────────────────
/**
 * Create a new post.
 * Accepts multipart/form-data with fields:
 *   title        (string, required)
 *   description  (string)
 *   status       (string: 'draft' | 'published')
 *   platforms    (JSON string array, e.g. '["Twitter","LinkedIn"]')
 *   media        (file, optional)
 */
router.post('/', upload.single('media'), async (req, res) => {
  try {
    const { title, description, status, platforms } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Post title is required.' });
    }

    let parsedPlatforms = [];
    if (platforms) {
      try {
        parsedPlatforms = JSON.parse(platforms);
      } catch {
        return res.status(400).json({ message: 'platforms must be a valid JSON array.' });
      }
    }

    // If Multer uploaded a file to Cloudinary, req.file will have the details
    let mediaUrl = null;
    let mediaPublicId = null;
    let mediaResourceType = null;

    if (req.file) {
      mediaUrl = req.file.path;          // Cloudinary secure URL
      mediaPublicId = req.file.filename; // Cloudinary public_id
      mediaResourceType = req.file.mimetype?.startsWith('video/') ? 'video' : 'image';
    }

    const post = await Post.create({
      authorId: req.user.id,
      title: title.trim(),
      description: description?.trim() || '',
      mediaUrl,
      mediaPublicId,
      mediaResourceType,
      platforms: parsedPlatforms,
      status: status || 'draft',
    });

    res.status(201).json(post);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ message: err.message || 'Failed to create post.' });
  }
});

// ─── DELETE /api/posts/bulk ───────────────────────────────────────────────────
/**
 * Bulk-delete posts by IDs.
 * Body: { ids: ["id1", "id2", ...] }
 * Also deletes associated Cloudinary assets.
 */
router.delete('/bulk', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Provide an array of post IDs to delete.' });
    }

    // Only allow deletion of posts the user owns
    const posts = await Post.find({
      _id: { $in: ids },
      authorId: req.user.id,
    });

    if (posts.length === 0) {
      return res.status(404).json({ message: 'No matching posts found.' });
    }

    // Delete Cloudinary assets in parallel
    const cloudinaryDeletions = posts
      .filter((p) => p.mediaPublicId)
      .map((p) =>
        cloudinary.uploader
          .destroy(p.mediaPublicId, { resource_type: p.mediaResourceType || 'image' })
          .catch((e) =>
            console.warn(`Cloudinary delete failed for ${p.mediaPublicId}:`, e.message)
          )
      );

    await Promise.all(cloudinaryDeletions);

    // Delete from MongoDB
    const foundIds = posts.map((p) => p._id);
    const result = await Post.deleteMany({ _id: { $in: foundIds } });

    res.json({
      message: `${result.deletedCount} post(s) deleted successfully.`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ message: 'Failed to delete posts.' });
  }
});

module.exports = router;
