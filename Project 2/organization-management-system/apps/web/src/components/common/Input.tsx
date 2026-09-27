import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || props.name;

  return (
    <div className="form-group">
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label} {props.required && <span style={{ color: 'var(--accent-rose)' }}>*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`form-input ${error ? 'border-rose' : ''} ${className}`}
        style={error ? { borderColor: 'var(--accent-rose)' } : undefined}
        {...props}
      />
      {error && <span className="form-error" role="alert">{error}</span>}
      {!error && helperText && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{helperText}</span>
      )}
    </div>
  );
};
