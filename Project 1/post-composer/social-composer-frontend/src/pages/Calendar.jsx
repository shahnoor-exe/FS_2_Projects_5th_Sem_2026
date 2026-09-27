import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/PostCard';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;

export default function Calendar() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // For simplicity, we just fetch all scheduled posts, but in a real app we'd paginate by month
  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/calendar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load scheduled posts.');
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  const handleEdit = (post) => navigate('/compose', { state: { post } });

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this scheduled post?')) return;
    try {
      const res = await fetch(`${API}/api/posts/${id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to cancel.');
      fetchCalendar();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Content Calendar</h1>
          <p className="page-subtitle">View and manage your upcoming scheduled posts.</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/compose')}>+ Schedule Post</button>
      </div>

      {error && <div className="toast toast-error">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Loading calendar…</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-title">No scheduled posts</h2>
          <p className="empty-desc">You don't have any posts scheduled right now.</p>
        </div>
      ) : (
        <div className="posts-grid" style={{ marginTop: '2rem' }}>
          {posts.map((post) => (
            <div key={post._id} style={{ position: 'relative' }}>
              <div style={{ padding: '0.5rem', background: '#312e81', borderRadius: '8px 8px 0 0', textAlign: 'center', fontWeight: 'bold' }}>
                Scheduled: {new Date(post.scheduledDate).toLocaleString()} ({post.timezone})
              </div>
              <PostCard
                post={post}
                userRole={user?.role}
                isSelected={false}
                onToggleSelect={() => {}}
                onEdit={() => handleEdit(post)}
                onDelete={() => handleCancel(post._id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
