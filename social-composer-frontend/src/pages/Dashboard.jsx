import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/PostCard';

const API = import.meta.env.VITE_API_URL;

export default function Dashboard() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState('');

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/posts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load posts.');
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map((p) => p._id)));
    }
  };

  const handleDeleteSingle = async (id) => {
    const confirmed = window.confirm('Delete this post? This action cannot be undone.');
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/posts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Delete failed.');

      setDeleteSuccess('Post deleted successfully.');
      setTimeout(() => setDeleteSuccess(''), 3000);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchPosts();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (post) => {
    navigate('/compose', { state: { post } });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedIds.size} post(s)? This also removes media from Cloudinary and cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/posts/bulk`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Delete failed.');

      setDeleteSuccess(`${data.deletedCount} post(s) deleted.`);
      setTimeout(() => setDeleteSuccess(''), 3000);
      setSelectedIds(new Set());
      await fetchPosts();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {user?.role === 'admin' ? 'Admin Panel — All Posts' : 'Your Posts'}
          </h1>
          <p className="page-subtitle">
            {posts.length} post{posts.length !== 1 ? 's' : ''} total
            {user?.role === 'admin' && ' (Admin View)'}
          </p>
        </div>
        <div className="page-header-actions">
          {posts.length > 0 && (
            <button
              id="select-all-btn"
              className="btn-secondary"
              onClick={toggleSelectAll}
            >
              {selectedIds.size === posts.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
          <button
            id="bulk-delete-btn"
            className="btn-danger"
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0 || deleting}
          >
            {deleting ? (
              <span className="btn-spinner" />
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2 4h12M6 4V2h4v2M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Delete ({selectedIds.size})
              </>
            )}
          </button>
          <button
            id="new-post-btn"
            className="btn-primary"
            onClick={() => navigate('/compose')}
          >
            + New Post
          </button>
        </div>
      </div>

      {/* Toast messages */}
      {deleteSuccess && (
        <div className="toast toast-success" role="status">{deleteSuccess}</div>
      )}
      {error && (
        <div className="toast toast-error" role="alert">{error}</div>
      )}

      {/* Content */}
      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Loading posts…</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="20" fill="#1e1b4b" />
              <rect x="14" y="20" width="36" height="6" rx="3" fill="#4f46e5" opacity="0.6" />
              <rect x="14" y="32" width="28" height="6" rx="3" fill="#6366f1" opacity="0.4" />
              <rect x="14" y="44" width="20" height="6" rx="3" fill="#818cf8" opacity="0.3" />
            </svg>
          </div>
          <h2 className="empty-title">No posts yet</h2>
          <p className="empty-desc">Create your first social media post to get started.</p>
          <button
            id="empty-compose-btn"
            className="btn-primary"
            onClick={() => navigate('/compose')}
          >
            Create First Post
          </button>
        </div>
      ) : (
        <div className="posts-grid" role="list">
          {posts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              userRole={user?.role}
              isSelected={selectedIds.has(post._id)}
              onToggleSelect={toggleSelect}
              onEdit={() => handleEdit(post)}
              onDelete={() => handleDeleteSingle(post._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
