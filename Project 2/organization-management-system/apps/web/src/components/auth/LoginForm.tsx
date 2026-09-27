import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { Input } from '../common/Input.js';
import { Button } from '../common/Button.js';
import { ApiError } from '../../api/client.js';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
  const { login } = useAuth();
  const { success, error: toastError } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError('Email and password are required');
      return;
    }

    try {
      setIsLoading(true);
      await login({ email: email.trim().toLowerCase(), password });
      success('Logged in successfully');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        toastError(err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'Login failed';
        setFormError(msg);
        toastError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card" id="login-card">
        <div className="auth-header">
          <div className="auth-brand">
            <div className="brand-logo">OS</div>
            <div className="brand-text">OrgSphere</div>
          </div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to your organization workspace</p>
        </div>

        {formError && (
          <div
            id="login-error-alert"
            data-testid="login-error-alert"
            className="toast toast-error"
            style={{ marginBottom: '1.5rem', width: '100%', boxSizing: 'border-box' }}
            role="alert"
          >
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} id="login-form">
          <Input
            id="login-email"
            name="email"
            type="email"
            label="Email Address"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            id="login-password"
            name="password"
            type="password"
            label="Password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button
            id="login-submit-btn"
            data-testid="login-submit-btn"
            type="submit"
            variant="primary"
            isLoading={isLoading}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            Sign In
          </Button>
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Don't have an account?{' '}
          <button
            id="switch-to-register-btn"
            data-testid="switch-to-register-btn"
            onClick={onSwitchToRegister}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--primary)',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Create an Organization
          </button>
        </div>
      </div>
    </div>
  );
};
