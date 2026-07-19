import { useState } from 'react';

const PLATFORM_COLORS = {
  Twitter: '#1d9bf0',
  LinkedIn: '#0a66c2',
  Instagram: '#e1306c',
  Facebook: '#1877f2',
};

export default function PostCard({ post, userRole, isSelected, onToggleSelect, onEdit, onDelete }) {
  const [imgError, setImgError] = useState(false);

  const isVideo =
    post.mediaUrl && /\.(mp4|mov|avi|webm)(\?|$)/i.test(post.mediaUrl);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <article
      className={`post-card ${isSelected ? 'selected' : ''}`}
      role="listitem"
    >
      {/* Selection checkbox */}
      <label className="card-checkbox-wrap" htmlFor={`select-${post._id}`}>
        <input
          type="checkbox"
          id={`select-${post._id}`}
          className="card-checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(post._id)}
          aria-label={`Select post: ${post.title}`}
        />
        <span className="checkbox-custom" />
      </label>

      {/* Media Preview */}
      <div className="card-media">
        {post.mediaUrl && !imgError ? (
          isVideo ? (
            <video
              src={post.mediaUrl}
              className="card-media-content"
              muted
              playsInline
              onError={() => setImgError(true)}
            />
          ) : (
            <img
              src={post.mediaUrl}
              alt={post.title}
              className="card-media-content"
              onError={() => setImgError(true)}
            />
          )
        ) : (
          <div className="card-media-placeholder">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M6 36l12-14 8 10 6-7 10 11H6z"
                fill="#4f46e5"
                opacity="0.5"
              />
              <circle cx="34" cy="16" r="5" fill="#818cf8" opacity="0.7" />
            </svg>
          </div>
        )}
        <div className="card-media-overlay" />
        
        {/* Hover Actions (Edit/Delete) */}
        <div className="card-actions-overlay">
          <button className="card-action-btn edit" onClick={onEdit} title="Edit Post">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="card-action-btn delete" onClick={onDelete} title="Delete Post">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Card Body */}
      <div className="card-body">
        <div className="card-header-row">
          <span className={`status-chip status-${post.status}`}>
            {post.status}
          </span>
          <span className="card-date">{formatDate(post.createdAt)}</span>
        </div>

        <h3 className="card-title">{post.title}</h3>

        {post.description && (
          <p className="card-desc">{post.description}</p>
        )}

        {/* Show Author if Admin */}
        {userRole === 'admin' && post.authorId?.username && (
          <p className="card-author" style={{ fontSize: '0.85rem', color: '#818cf8', marginTop: '0.5rem' }}>
            By: {post.authorId.username}
          </p>
        )}

        {post.platforms?.length > 0 && (
          <div className="platform-badges">
            {post.platforms.map((p) => (
              <span
                key={p}
                className="platform-badge"
                style={{ '--badge-color': PLATFORM_COLORS[p] || '#6366f1' }}
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
