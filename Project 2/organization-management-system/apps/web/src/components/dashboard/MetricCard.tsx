import React from 'react';

interface MetricCardProps {
  title: string;
  value: number | string;
  subtext?: string;
  icon: React.ReactNode;
  accentColor?: string;
  id?: string;
  'data-testid'?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtext,
  icon,
  accentColor = 'var(--primary)',
  id,
  'data-testid': testId,
}) => {
  return (
    <div className="glass-card" id={id} data-testid={testId}>
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        <div
          className="metric-icon-box"
          style={{
            backgroundColor: `${accentColor}20`,
            color: accentColor,
            border: `1px solid ${accentColor}40`,
          }}
        >
          {icon}
        </div>
      </div>
      <div className="metric-value" data-testid={`${testId || 'metric'}-value`}>
        {value}
      </div>
      {subtext && <div className="metric-subtext">{subtext}</div>}
    </div>
  );
};
