const express = require('express');
const Post = require('../models/Post');
const auth = require('../middlewares/auth');
const { upload, cloudinary } = require('../middlewares/upload');

const router = express.Router();

// All post routes require a valid JWT
router.use(auth);

// ─── GET /api/posts ───────────────────────────────────────────────────────────
/**
 * Return posts. Admin gets all posts, editors get their own.
 */
router.get('/', async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { authorId: req.user.id };
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .populate('authorId', 'username') // Populate author username for admin view
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

// ─── PUT /api/posts/:id ───────────────────────────────────────────────────────
/**
 * Update an existing post.
 * Allows replacing media. Replaces old Cloudinary asset if new one is uploaded.
 */
router.put('/:id', upload.single('media'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, platforms, removeMedia } = req.body;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    // Check ownership or admin
    if (post.authorId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to edit this post.' });
    }

    if (title) post.title = title.trim();
    if (description !== undefined) post.description = description.trim();
    if (status) post.status = status;
    if (platforms) {
      try {
        post.platforms = JSON.parse(platforms);
      } catch {
        return res.status(400).json({ message: 'platforms must be a valid JSON array.' });
      }
    }

    // Handle media updates (upload new media or remove existing)
    if (req.file || removeMedia === 'true') {
      if (post.mediaPublicId) {
        // Delete old asset from Cloudinary
        await cloudinary.uploader
          .destroy(post.mediaPublicId, { resource_type: post.mediaResourceType || 'image' })
          .catch((e) => console.warn(`Cloudinary delete failed for ${post.mediaPublicId}:`, e.message));
      }

      if (req.file) {
        post.mediaUrl = req.file.path;
        post.mediaPublicId = req.file.filename;
        post.mediaResourceType = req.file.mimetype?.startsWith('video/') ? 'video' : 'image';
      } else if (removeMedia === 'true') {
        post.mediaUrl = null;
        post.mediaPublicId = null;
        post.mediaResourceType = null;
      }
    }

    await post.save();
    res.json(post);
  } catch (err) {
    console.error('Update post error:', err);
    res.status(500).json({ message: 'Failed to update post.' });
  }
});

// ─── DELETE /api/posts/:id ────────────────────────────────────────────────────
/**
 * Delete a single post.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = req.user.role === 'admin' ? { _id: id } : { _id: id, authorId: req.user.id };
    const post = await Post.findOne(query);

    if (!post) {
      return res.status(404).json({ message: 'Post not found or unauthorized.' });
    }

    if (post.mediaPublicId) {
      await cloudinary.uploader
        .destroy(post.mediaPublicId, { resource_type: post.mediaResourceType || 'image' })
        .catch((e) => console.warn(`Cloudinary delete failed for ${post.mediaPublicId}:`, e.message));
    }

    await post.deleteOne();
    res.json({ message: 'Post deleted successfully.' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ message: 'Failed to delete post.' });
  }
});

// ─── DELETE /api/posts/bulk ───────────────────────────────────────────────────
/**
 * Bulk-delete posts by IDs.
 */
router.delete('/bulk', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Provide an array of post IDs to delete.' });
    }

    const query = req.user.role === 'admin' ? { _id: { $in: ids } } : { _id: { $in: ids }, authorId: req.user.id };
    const posts = await Post.find(query);

    if (posts.length === 0) {
      return res.status(404).json({ message: 'No matching posts found or unauthorized.' });
    }

    const cloudinaryDeletions = posts
      .filter((p) => p.mediaPublicId)
      .map((p) =>
        cloudinary.uploader
          .destroy(p.mediaPublicId, { resource_type: p.mediaResourceType || 'image' })
          .catch((e) => console.warn(`Cloudinary delete failed for ${p.mediaPublicId}:`, e.message))
      );

    await Promise.all(cloudinaryDeletions);

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
