import React, { useState } from 'react';

interface Props {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
  icon?: string;
}

export const Section: React.FC<Props> = ({ title, count, children, defaultCollapsed = false, className = '', icon }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = () => setCollapsed(!collapsed);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <div className={`section ${className} ${collapsed ? 'collapsed' : ''}`}>
      <div
        className="section-header"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-controls={`section-${title}`}
      >
        <span className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
        {icon && <span className={`codicon codicon-${icon}`} />}
        <span className="section-title">{title}</span>
        <span className="section-count">{count}</span>
      </div>
      {!collapsed && <div className="section-content" id={`section-${title}`}>{children}</div>}
    </div>
  );
};
