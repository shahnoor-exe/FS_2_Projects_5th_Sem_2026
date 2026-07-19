import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <div className="navbar-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="8" fill="url(#logoGrad)" />
            <path d="M8 14h12M14 8v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#a855f7" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <span className="navbar-title">SocialComposer</span>
      </div>

      <div className="navbar-links">
        <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
          Dashboard
        </Link>
        <Link to="/compose" className={`nav-link ${isActive('/compose') ? 'active' : ''}`}>
          New Post
        </Link>
      </div>

      <div className="navbar-user">
        <div className="user-badge">
          <div className="user-avatar">{user?.username?.[0]?.toUpperCase() || 'U'}</div>
          <span className="user-name">{user?.username}</span>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
