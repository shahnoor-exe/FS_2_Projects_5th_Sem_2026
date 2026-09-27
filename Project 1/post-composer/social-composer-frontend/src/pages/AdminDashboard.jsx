import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;

export default function AdminDashboard() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/');
    }
  }, [user, navigate]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch metrics');
      setMetrics(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) return <div className="page-container"><p>Loading metrics...</p></div>;
  if (error) return <div className="page-container"><p className="auth-error">{error}</p></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Admin Metrics Dashboard</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
        <div style={{ padding: '1.5rem', background: '#1e1b4b', borderRadius: '12px', border: '1px solid #312e81' }}>
          <h3>Total Users</h3>
          <p style={{ fontSize: '2rem', color: '#818cf8', margin: '0.5rem 0' }}>{metrics?.totalUsers}</p>
        </div>
        <div style={{ padding: '1.5rem', background: '#1e1b4b', borderRadius: '12px', border: '1px solid #312e81' }}>
          <h3>Active Users</h3>
          <p style={{ fontSize: '2rem', color: '#34d399', margin: '0.5rem 0' }}>{metrics?.activeUsers}</p>
        </div>
        <div style={{ padding: '1.5rem', background: '#1e1b4b', borderRadius: '12px', border: '1px solid #312e81' }}>
          <h3>Total Posts</h3>
          <p style={{ fontSize: '2rem', color: '#a855f7', margin: '0.5rem 0' }}>{metrics?.totalPosts}</p>
        </div>
        <div style={{ padding: '1.5rem', background: '#1e1b4b', borderRadius: '12px', border: '1px solid #312e81' }}>
          <h3>Drafts</h3>
          <p style={{ fontSize: '2rem', color: '#94a3b8', margin: '0.5rem 0' }}>{metrics?.draftCount}</p>
        </div>
        <div style={{ padding: '1.5rem', background: '#1e1b4b', borderRadius: '12px', border: '1px solid #312e81' }}>
          <h3>Scheduled</h3>
          <p style={{ fontSize: '2rem', color: '#fbbf24', margin: '0.5rem 0' }}>{metrics?.scheduledCount}</p>
        </div>
        <div style={{ padding: '1.5rem', background: '#1e1b4b', borderRadius: '12px', border: '1px solid #312e81' }}>
          <h3>Published</h3>
          <p style={{ fontSize: '2rem', color: '#34d399', margin: '0.5rem 0' }}>{metrics?.publishedCount}</p>
        </div>
        <div style={{ padding: '1.5rem', background: '#1e1b4b', borderRadius: '12px', border: '1px solid #312e81' }}>
          <h3>Cancelled</h3>
          <p style={{ fontSize: '2rem', color: '#f87171', margin: '0.5rem 0' }}>{metrics?.cancelledCount}</p>
        </div>
        <div style={{ padding: '1.5rem', background: '#1e1b4b', borderRadius: '12px', border: '1px solid #312e81' }}>
          <h3>Failed</h3>
          <p style={{ fontSize: '2rem', color: '#ef4444', margin: '0.5rem 0' }}>{metrics?.failedCount}</p>
        </div>
      </div>
    </div>
  );
}
