const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Post title is required'],
      trim: true,
      maxlength: [280, 'Title cannot exceed 280 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    // Cloudinary secure URL for the uploaded image or video
    mediaUrl: {
      type: String,
      default: null,
    },
    // Cloudinary public_id — used to delete the asset when the post is deleted
    mediaPublicId: {
      type: String,
      default: null,
    },
    // Cloudinary resource type: 'image' | 'video' | null
    mediaResourceType: {
      type: String,
      enum: ['image', 'video', null],
      default: null,
    },
    // e.g. ['Twitter', 'LinkedIn', 'Instagram', 'Facebook']
    platforms: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          arr.every((p) =>
            ['Twitter', 'LinkedIn', 'Instagram', 'Facebook'].includes(p)
          ),
        message: 'Invalid platform specified.',
      },
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'scheduled', 'failed', 'cancelled'],
      default: 'draft',
    },
    scheduledDate: {
      type: Date,
      default: null,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    publicationHistory: {
      type: [
        {
          platform: String,
          status: { type: String, enum: ['success', 'failed', 'pending'] },
          error: String,
          publishedAt: Date,
        }
      ],
      default: [],
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
postSchema.index({ authorId: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
