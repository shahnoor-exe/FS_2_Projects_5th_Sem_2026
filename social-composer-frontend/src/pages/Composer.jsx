import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

const PLATFORMS = ['Twitter', 'LinkedIn', 'Instagram', 'Facebook'];

export default function Composer() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  const togglePlatform = (p) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaPreview({ url, type: file.type.startsWith('video/') ? 'video' : 'image' });
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title.trim()) {
      setError('Post title is required.');
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform.');
      return;
    }

    setSubmitting(true);

    try {
      // Use FormData — do NOT set Content-Type header manually
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('status', status);
      formData.append('platforms', JSON.stringify(selectedPlatforms));
      if (mediaFile) {
        formData.append('media', mediaFile);
      }

      const res = await fetch(`${API}/api/posts`, {
        method: 'POST',
        headers: {
          // ⚠️ Do NOT add Content-Type here — the browser sets it with the multipart boundary
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create post.');

      setSuccess('Post created successfully!');
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Post</h1>
          <p className="page-subtitle">Compose and schedule your social content.</p>
        </div>
        <button
          id="back-to-dashboard-btn"
          className="btn-secondary"
          onClick={() => navigate('/')}
        >
          ← Dashboard
        </button>
      </div>

      <div className="composer-layout">
        {/* ── Form ── */}
        <form
          id="composer-form"
          className="composer-form"
          onSubmit={handleSubmit}
        >
          {/* Title */}
          <div className="form-group">
            <label htmlFor="post-title" className="form-label">
              Post Title <span className="required">*</span>
            </label>
            <input
              id="post-title"
              type="text"
              className="form-input"
              placeholder="What's this post about?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={280}
              disabled={submitting}
            />
            <span className="char-count">{title.length}/280</span>
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="post-description" className="form-label">
              Description
            </label>
            <textarea
              id="post-description"
              className="form-input form-textarea"
              placeholder="Add your post copy here…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={5}
              disabled={submitting}
            />
            <span className="char-count">{description.length}/2000</span>
          </div>

          {/* Platforms */}
          <div className="form-group">
            <label className="form-label">
              Platforms <span className="required">*</span>
            </label>
            <div className="platform-checkboxes">
              {PLATFORMS.map((p) => (
                <label
                  key={p}
                  htmlFor={`platform-${p}`}
                  className={`platform-option ${selectedPlatforms.includes(p) ? 'checked' : ''}`}
                >
                  <input
                    id={`platform-${p}`}
                    type="checkbox"
                    className="visually-hidden"
                    checked={selectedPlatforms.includes(p)}
                    onChange={() => togglePlatform(p)}
                    disabled={submitting}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="form-group">
            <label htmlFor="post-status" className="form-label">Status</label>
            <select
              id="post-status"
              className="form-input form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={submitting}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>

          {/* Media Upload */}
          <div className="form-group">
            <label className="form-label">Media (Image / Video)</label>
            <div
              className="file-drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              tabIndex={0}
              role="button"
              aria-label="Upload media file"
            >
              <input
                ref={fileInputRef}
                id="media-file-input"
                type="file"
                accept="image/*,video/*"
                className="visually-hidden"
                onChange={handleFileChange}
                disabled={submitting}
              />
              {mediaPreview ? (
                <div className="media-preview-wrap">
                  {mediaPreview.type === 'video' ? (
                    <video
                      src={mediaPreview.url}
                      className="media-preview"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={mediaPreview.url}
                      alt="Preview"
                      className="media-preview"
                    />
                  )}
                  <button
                    type="button"
                    id="remove-media-btn"
                    className="remove-media-btn"
                    onClick={(e) => { e.stopPropagation(); removeMedia(); }}
                    aria-label="Remove media"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="drop-zone-hint">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <path
                      d="M20 8v16M12 16l8-8 8 8M8 30h24"
                      stroke="#6366f1"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p>Click to upload image or video</p>
                  <span>JPG, PNG, GIF, WebP, MP4, MOV — max 100MB</span>
                </div>
              )}
            </div>
          </div>

          {/* Errors / Success */}
          {error && (
            <div className="auth-error" role="alert">{error}</div>
          )}
          {success && (
            <div className="auth-success" role="status">{success}</div>
          )}

          {/* Submit */}
          <div className="form-actions">
            <button
              id="composer-cancel-btn"
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/')}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              id="composer-submit-btn"
              type="submit"
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="btn-spinner" />
                  Uploading…
                </>
              ) : (
                'Create Post'
              )}
            </button>
          </div>
        </form>

        {/* ── Live Preview ── */}
        <aside className="composer-preview">
          <h2 className="preview-label">Preview</h2>
          <div className="preview-card">
            {mediaPreview ? (
              mediaPreview.type === 'video' ? (
                <video
                  src={mediaPreview.url}
                  className="preview-media"
                  muted
                  controls
                  playsInline
                />
              ) : (
                <img
                  src={mediaPreview.url}
                  alt="Preview"
                  className="preview-media"
                />
              )
            ) : (
              <div className="preview-media-empty">
                <span>No media selected</span>
              </div>
            )}
            <div className="preview-body">
              <h3 className="preview-title">
                {title || <span className="preview-placeholder">Post title…</span>}
              </h3>
              <p className="preview-desc">
                {description || <span className="preview-placeholder">Description…</span>}
              </p>
              {selectedPlatforms.length > 0 && (
                <div className="platform-badges">
                  {selectedPlatforms.map((p) => (
                    <span key={p} className="platform-badge">{p}</span>
                  ))}
                </div>
              )}
              <span className={`status-chip status-${status}`}>{status}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
