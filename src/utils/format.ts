import { BeadItemData } from './beads';
import { redactLogContent } from './fs';

export function formatError(prefix: string, error: unknown): string {
  if (error instanceof Error) {
    return `${prefix}: ${error.message}`;
  }
  return prefix;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (m) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m] || m;
  });
}

export function linkifyText(text: string): string {
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  return escaped.replace(urlRegex, '<a href="$1" class="external-link" target="_blank">$1</a>');
}

export function escapeMarkdownText(text: string): string {
  if (!text) {
    return '';
  }
  const htmlEscaped = escapeHtml(text);
  return htmlEscaped.replace(/([\\`*_{}[\]()#+.!|-])/g, '\\$1');
}

export function sanitizeTooltipText(text: string): string {
  if (!text) {
    return '';
  }
  const escaped = escapeMarkdownText(text);
  return escaped.replace(/javascript:/gi, '');
}

export function createTooltip(bead: BeadItemData): string {
  const parts: string[] = [bead.title];
  if (bead.status) {
    parts.push(`Status: ${bead.status}`);
  }
  if (bead.filePath) {
    parts.push(`File: ${bead.filePath}`);
  }
  if (bead.tags && bead.tags.length > 0) {
    parts.push(`Tags: ${bead.tags.join(', ')}`);
  }
  if (bead.externalReferenceId) {
    const displayText = bead.externalReferenceDescription || bead.externalReferenceId;
    parts.push(`External Ref: ${displayText} (${bead.externalReferenceId})`);
  }
  return parts.join('\n');
}

export function buildPreviewSnippet(text: string | undefined, maxLength: number = 60): string | undefined {
  if (!text) {
    return undefined;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function parseUtcDate(timestamp: string | undefined): Date {
  if (!timestamp) {
    return new Date(NaN);
  }

  const trimmed = timestamp.trim();
  if (!trimmed) {
    return new Date(NaN);
  }

  const withT = trimmed.replace(' ', 'T');
  const hasZone = /([+-]\d{2}:?\d{2}|Z)$/i.test(withT);
  const normalized = hasZone ? withT : `${withT}Z`;

  return new Date(normalized);
}

export function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) {
    return '';
  }

  const date = parseUtcDate(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else if (diffWeeks < 4) {
    return `${diffWeeks}w ago`;
  } else {
    return `${diffMonths}mo ago`;
  }
}

export function sanitizeErrorMessage(error: unknown, workspacePaths: string[] = []): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const redacted = redactLogContent(raw, { workspacePaths });
  return redacted.replace(/\s+/g, ' ').trim();
}

export function formatSafeError(prefix: string, error: unknown, workspacePaths: string[] = []): string {
  const sanitized = sanitizeErrorMessage(error, workspacePaths);
  return sanitized ? `${prefix}: ${sanitized}` : prefix;
}
