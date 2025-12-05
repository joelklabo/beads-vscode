import React from 'react';
import { ThemeTokens, lightTokens } from '../theme/tokens';

export interface BeadDependencyGroup {
  upstream?: string[];
  downstream?: string[];
}

export interface BeadDetailData {
  id: string;
  title: string;
  description?: string;
  status?: string;
  labels?: string[];
  dependencies?: BeadDependencyGroup;
}

export interface BeadDetailProps {
  bead?: BeadDetailData;
  tokens?: ThemeTokens;
}

export const BeadDetail: React.FC<BeadDetailProps> = ({ bead, tokens = lightTokens }) => {
  if (!bead) {
    return <div aria-label="bead-detail-empty">Select a bead to see details.</div>;
  }

  return (
    <article aria-label={`Detail for ${bead.title}`} style={{ background: tokens.surface, color: tokens.text, padding: 12, border: `1px solid ${tokens.border}`, borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>{bead.title}</h2>
      <p aria-label="status" style={{ color: tokens.muted }}>Status: {bead.status ?? 'open'}</p>
      {bead.description && <p aria-label="description">{bead.description}</p>}
      {bead.labels && bead.labels.length > 0 && (
        <div aria-label="labels" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {bead.labels.map((label) => (
            <span key={label} style={{ padding: '2px 6px', borderRadius: 4, background: tokens.background, border: `1px solid ${tokens.border}`, fontSize: 12 }}>
              {label}
            </span>
          ))}
        </div>
      )}
      {bead.dependencies && (
        <div style={{ marginTop: 12 }}>
          <div aria-label="upstream" style={{ marginBottom: 4 }}>
            <strong>Upstream:</strong> {bead.dependencies.upstream?.join(', ') || 'None'}
          </div>
          <div aria-label="downstream">
            <strong>Downstream:</strong> {bead.dependencies.downstream?.join(', ') || 'None'}
          </div>
        </div>
      )}
    </article>
  );
};
