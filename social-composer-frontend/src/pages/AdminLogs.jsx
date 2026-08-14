import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;

export default function AdminLogs() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') navigate('/');
  }, [user, navigate]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading) return <div className="page-container"><p>Loading logs...</p></div>;

  return (
    <div className="page-container">
      <h1 className="page-title">Audit Logs</h1>
      <p className="page-subtitle">Recent administrative actions.</p>
      
      <table style={{ width: '100%', marginTop: '2rem', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ background: '#312e81', textAlign: 'left' }}>
            <th style={{ padding: '1rem' }}>Timestamp</th>
            <th style={{ padding: '1rem' }}>Admin</th>
            <th style={{ padding: '1rem' }}>Action</th>
            <th style={{ padding: '1rem' }}>Target Type</th>
            <th style={{ padding: '1rem' }}>Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log._id} style={{ borderBottom: '1px solid #1e1b4b' }}>
              <td style={{ padding: '1rem' }}>{new Date(log.createdAt).toLocaleString()}</td>
              <td style={{ padding: '1rem', color: '#818cf8' }}>{log.adminId?.username}</td>
              <td style={{ padding: '1rem' }}>
                <span style={{ 
                  background: '#0f172a', border: '1px solid #4f46e5', padding: '0.25rem 0.5rem', borderRadius: '4px' 
                }}>
                  {log.action}
                </span>
              </td>
              <td style={{ padding: '1rem' }}>{log.targetModel}</td>
              <td style={{ padding: '1rem', color: '#cbd5e1' }}>{log.details}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center' }}>No logs found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
