import React from 'react';

interface Props {
  message?: string;
}

export function ErrorBanner({ message }: Props): JSX.Element | null {
  if (!message) return null;
  return (
    <div className="banner banner-error" role="alert">
      <strong>CLI unavailable:</strong> <span>{message}</span>
    </div>
  );
}

export default ErrorBanner;
