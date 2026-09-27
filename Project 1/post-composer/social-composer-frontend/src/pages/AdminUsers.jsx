import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;

export default function AdminUsers() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') navigate('/');
  }, [user, navigate]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleStatus = async (id, currentStatus) => {
    try {
      await fetch(`${API}/api/admin/users/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      fetchUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  const changeRole = async (id, newRole) => {
    try {
      await fetch(`${API}/api/admin/users/${id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      fetchUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <div className="page-container"><p>Loading users...</p></div>;

  return (
    <div className="page-container">
      <h1 className="page-title">User Management</h1>
      
      <table style={{ width: '100%', marginTop: '2rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#312e81', textAlign: 'left' }}>
            <th style={{ padding: '1rem' }}>Username</th>
            <th style={{ padding: '1rem' }}>Role</th>
            <th style={{ padding: '1rem' }}>Status</th>
            <th style={{ padding: '1rem' }}>Joined</th>
            <th style={{ padding: '1rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u._id} style={{ borderBottom: '1px solid #1e1b4b' }}>
              <td style={{ padding: '1rem' }}>{u.username}</td>
              <td style={{ padding: '1rem' }}>
                <select 
                  value={u.role} 
                  onChange={(e) => changeRole(u._id, e.target.value)}
                  disabled={u._id === user.id}
                  style={{ background: '#0f172a', color: '#fff', border: '1px solid #312e81', padding: '0.25rem' }}
                >
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td style={{ padding: '1rem' }}>
                <span style={{ color: u.isActive ? '#34d399' : '#f87171' }}>
                  {u.isActive ? 'Active' : 'Deactivated'}
                </span>
              </td>
              <td style={{ padding: '1rem' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td style={{ padding: '1rem' }}>
                <button 
                  className={u.isActive ? "btn-danger" : "btn-primary"} 
                  onClick={() => toggleStatus(u._id, u.isActive)}
                  disabled={u._id === user.id}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                >
                  {u.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
