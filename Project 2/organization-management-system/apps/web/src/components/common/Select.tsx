import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  id,
  className = '',
  ...props
}) => {
  const selectId = id || props.name;

  return (
    <div className="form-group">
      {label && (
        <label htmlFor={selectId} className="form-label">
          {label} {props.required && <span style={{ color: 'var(--accent-rose)' }}>*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={`form-select ${className}`}
        style={error ? { borderColor: 'var(--accent-rose)' } : undefined}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="form-error" role="alert">{error}</span>}
    </div>
  );
};
