import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { Input } from '../common/Input.js';
import { Button } from '../common/Button.js';
import { ApiError } from '../../api/client.js';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const { register } = useAuth();
  const { success, error: toastError } = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password.length < 12) {
      setFormError('Password must be at least 12 characters long according to security policy');
      return;
    }

    try {
      setIsLoading(true);
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
        organizationName: organizationName.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      success('Organization created and session initialized');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        toastError(err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        setFormError(msg);
        toastError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card" id="register-card" style={{ maxWidth: '480px' }}>
        <div className="auth-header">
          <div className="auth-brand">
            <div className="brand-logo">OS</div>
            <div className="brand-text">OrgSphere</div>
          </div>
          <h1 className="auth-title">Create Organization</h1>
          <p className="auth-subtitle">Set up your multi-tenant workspace & admin account</p>
        </div>

        {formError && (
          <div
            id="register-error-alert"
            data-testid="register-error-alert"
            className="toast toast-error"
            style={{ marginBottom: '1.5rem', width: '100%', boxSizing: 'border-box' }}
            role="alert"
          >
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} id="register-form">
          <Input
            id="register-org-name"
            name="organizationName"
            type="text"
            label="Organization Name"
            placeholder="Acme Corp"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              id="register-first-name"
              name="firstName"
              type="text"
              label="First Name"
              placeholder="Alice"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              id="register-last-name"
              name="lastName"
              type="text"
              label="Last Name"
              placeholder="Smith"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>

          <Input
            id="register-email"
            name="email"
            type="email"
            label="Work Email"
            placeholder="alice@acmecorp.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            id="register-password"
            name="password"
            type="password"
            label="Password (min 12 chars)"
            placeholder="At least 12 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helperText="Must be at least 12 characters with passphrase strength"
            autoComplete="new-password"
          />

          <Input
            id="register-phone"
            name="phone"
            type="tel"
            label="Phone (Optional)"
            placeholder="+1234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <Button
            id="register-submit-btn"
            data-testid="register-submit-btn"
            type="submit"
            variant="primary"
            isLoading={isLoading}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            Get Started
          </Button>
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <button
            id="switch-to-login-btn"
            data-testid="switch-to-login-btn"
            onClick={onSwitchToLogin}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--primary)',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
