import React from 'react';

interface BadgeProps {
  color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan';
  children: React.ReactNode;
  className?: string;
  id?: string;
  'data-testid'?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  color = 'indigo',
  children,
  className = '',
  id,
  'data-testid': testId,
}) => {
  return (
    <span
      id={id}
      data-testid={testId}
      className={`badge badge-${color} ${className}`}
    >
      {children}
    </span>
  );
};
