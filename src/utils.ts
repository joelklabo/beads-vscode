import * as path from 'path';
import sanitizeHtml, { Attributes, IOptions } from 'sanitize-html';
import { Buffer } from 'buffer';

export interface BeadItemData {
  id: string;
  title: string;
  description?: string;
  filePath?: string;
  status?: string;
  tags?: string[];
  updatedAt?: string;
  externalReferenceId?: string;
  externalReferenceDescription?: string;
  raw?: unknown;
  idKey?: string;
  externalReferenceKey?: string;
  blockingDepsCount?: number;
  /** Timestamp when the task entered in_progress status (for stale detection) */
  inProgressSince?: string;
  /** Issue type (epic, task, bug, feature, chore, spike) */
  issueType?: string;
  /** Parent issue ID for parent-child relationships (used for epic grouping) */
  parentId?: string;
  /** Number of child issues (for epics) */
  childCount?: number;
}

export function pickValue(entry: any, keys: string[], fallback?: string): string | undefined {
  if (!entry || typeof entry !== 'object') {
    return fallback;
  }

  for (const key of keys) {
    if (key in entry) {
      const value = entry[key];
      if (value === undefined || value === null) {
        continue;
      }
      return String(value);
    }
  }

  return fallback;
}

export function pickFirstKey(entry: any, keys: string[]): { value?: string; key?: string } {
  if (!entry || typeof entry !== 'object') {
    return {};
  }

  for (const key of keys) {
    if (key in entry) {
      const value = entry[key];
      if (value === undefined || value === null) {
        continue;
      }
      return { value: String(value), key };
    }
  }

  return {};
}

export function pickTags(entry: any): string[] | undefined {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }

  const candidate = entry.labels ?? entry.tags ?? entry.tag_list;
  if (!candidate) {
    return undefined;
  }

  if (Array.isArray(candidate)) {
    return candidate.map((tag) => String(tag));
  }

  if (typeof candidate === 'string') {
    return candidate
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);
  }

  return undefined;
}

export function normalizeBead(entry: any, index = 0): BeadItemData {
  const { value: id, key: idKey } = pickFirstKey(entry, ['id', 'uuid', 'beadId']);
  const title = pickValue(entry, ['title', 'name'], id ?? `bead-${index}`) ?? `bead-${index}`;
  const description = pickValue(entry, ['description', 'desc', 'body']);
  const filePath = pickValue(entry, ['file', 'path', 'filename']);
  const status = pickValue(entry, ['status', 'state']);
  const tags = pickTags(entry);
  const updatedAt = pickValue(entry, ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt']);
  const issueType = pickValue(entry, ['issue_type', 'issueType', 'type']);
  const { value: externalReferenceRaw, key: externalReferenceKey } = pickFirstKey(entry, [
    'external_reference_id',
    'externalReferenceId',
    'external_ref',
    'external_reference',
    'externalRefId',
  ]);

  // Parse external_ref format: "ID:description"
  let externalReferenceId: string | undefined;
  let externalReferenceDescription: string | undefined;
  if (externalReferenceRaw) {
    const parts = externalReferenceRaw.split(':', 2);
    externalReferenceId = parts[0];
    externalReferenceDescription = parts.length > 1 ? parts[1] : undefined;
  }

  // Count blocking dependencies (those not closed)
  // Also extract parentId from parent-child dependencies
  let blockingDepsCount = 0;
  let parentId: string | undefined;
  const dependencies = entry?.dependencies || [];
  for (const dep of dependencies) {
    const depType = dep.dep_type || dep.type || 'related';
    if (depType === 'blocks') {
      // We'll count it - the actual status check happens in extension.ts with all items
      blockingDepsCount++;
    } else if (depType === 'parent-child') {
      // For parent-child relationships, depends_on_id is the parent
      parentId = dep.depends_on_id;
    }
  }

  // For stale detection: if status is in_progress, use updated_at as proxy for when it entered that status
  // A more accurate approach would track status change events, but updated_at is a good approximation
  const inProgressSince = status === 'in_progress' ? updatedAt : undefined;

  return {
    id: id ?? `bead-${index}`,
    idKey,
    title,
    description,
    filePath,
    status,
    tags,
    updatedAt,
    externalReferenceId,
    externalReferenceDescription,
    externalReferenceKey,
    raw: entry,
    blockingDepsCount,
    inProgressSince,
    issueType,
    parentId,
  };
}

export function extractBeads(root: unknown): any[] | undefined {
  if (Array.isArray(root)) {
    return root;
  }

  if (root && typeof root === 'object') {
    const record = root as Record<string, unknown>;
    if (Array.isArray(record.beads)) {
      return record.beads as any[];
    }

    const project = record.project;
    if (project && typeof project === 'object') {
      const projectBeads = (project as Record<string, unknown>).beads;
      if (Array.isArray(projectBeads)) {
        return projectBeads as any[];
      }
    }
  }

  return undefined;
}

export function resolveDataFilePath(dataFile: string, projectRoot: string | undefined): string | undefined {
  if (!dataFile || dataFile.trim().length === 0) {
    return undefined;
  }

  if (path.isAbsolute(dataFile)) {
    return dataFile;
  }

  if (!projectRoot) {
    return undefined;
  }

  return path.join(projectRoot, dataFile);
}

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
  const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
  return escaped.replace(urlRegex, '<a href="$1" class="external-link" target="_blank">$1</a>');
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

/**
 * Parse a timestamp string into a Date, treating missing timezone info as UTC and
 * normalizing space-separated formats from SQLite (`YYYY-MM-DD HH:MM:SS`).
 */
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

/**
 * Default threshold in hours for considering an in_progress task as stale.
 * Tasks in progress for longer than this are flagged as potentially stuck.
 */
export const DEFAULT_STALE_THRESHOLD_HOURS = 24;

/**
 * Determines if a task is considered stale based on how long it has been in_progress.
 * @param bead The bead item to check
 * @param thresholdHours Number of hours after which an in_progress task is considered stale
 * @returns true if the task is stale, false otherwise
 */
export function isStale(bead: BeadItemData, thresholdHours: number = DEFAULT_STALE_THRESHOLD_HOURS): boolean {
  // Only in_progress tasks can be stale
  if (bead.status !== 'in_progress' || !bead.inProgressSince) {
    return false;
  }

  const inProgressDate = new Date(bead.inProgressSince);
  const now = new Date();
  const diffMs = now.getTime() - inProgressDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return diffHours >= thresholdHours;
}

/**
 * Calculates how long a task has been in_progress.
 * @param bead The bead item to check
 * @returns Object with hours in progress and formatted string, or undefined if not in progress
 */
export function getStaleInfo(bead: BeadItemData): { hoursInProgress: number; formattedTime: string } | undefined {
  if (bead.status !== 'in_progress' || !bead.inProgressSince) {
    return undefined;
  }

  const inProgressDate = new Date(bead.inProgressSince);
  const now = new Date();
  const diffMs = now.getTime() - inProgressDate.getTime();
  const hoursInProgress = diffMs / (1000 * 60 * 60);

  // Format the time in a human-readable way
  const days = Math.floor(hoursInProgress / 24);
  const hours = Math.floor(hoursInProgress % 24);

  let formattedTime: string;
  if (days > 0) {
    formattedTime = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } else if (hours > 0) {
    formattedTime = `${hours}h`;
  } else {
    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
    formattedTime = `${minutes}m`;
  }

  return { hoursInProgress, formattedTime };
}

/**
 * Shared Little Glen sanitization allowlist.
 * Tags: headings, paragraphs/lists, emphasis, code, hr/br, spans/divs, images, links.
 * Attributes:
 *   - a: href, title, target, rel (rel/target normalized to prevent tab-nabbing)
 *   - img: src, alt, title (src restricted to data: and vscode webview resources)
 * Schemes:
 *   - Links: http, https, mailto, tel, vscode-resource, vscode-webview-resource
 *   - Images: data, vscode-resource, vscode-webview-resource (remote images blocked)
 */
const LITTLE_GLEN_SANITIZE_BASE: IOptions = {
  allowedTags: [
    'a',
    'p',
    'ul',
    'ol',
    'li',
    'b',
    'i',
    'strong',
    'em',
    'code',
    'pre',
    'span',
    'div',
    'br',
    'hr',
    'img',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote'
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'vscode-resource', 'vscode-webview-resource'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto', 'tel', 'vscode-resource', 'vscode-webview-resource'],
    img: ['data', 'vscode-resource', 'vscode-webview-resource']
  },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true,
  transformTags: {
    a: sanitizeHtml.simpleTransform(
      'a',
      { target: '_blank', rel: 'noopener noreferrer' },
      true // merge with existing attributes
    ),
    img: (tagName: string, attribs: Attributes) => {
      const src = attribs.src ?? '';
      const lowerSrc = src.toLowerCase();
      // Drop non-image data URIs to avoid svg/script payloads smuggled as images
      if (lowerSrc.startsWith('data:') && !lowerSrc.startsWith('data:image/')) {
        delete attribs.src;
      }
      return { tagName, attribs };
    }
  }
};

export interface MarkdownSanitizeOptions {
  /** Allow http/https images (blocked by default). */
  allowRemoteImages?: boolean;
}

/**
 * Sanitize markdown/HTML produced for Little Glen surfaces (webview panel + hovers).
 * - Removes script/iframe/object tags and inline event handlers
 * - Normalizes links to open in a safe new tab with rel="noopener noreferrer"
 * - Restricts image sources to data: and VS Code webview resource schemes by default
 */
export function sanitizeMarkdown(markdown: string, options: MarkdownSanitizeOptions = {}): string {
  const baseSchemesByTag = LITTLE_GLEN_SANITIZE_BASE.allowedSchemesByTag as Record<string, string[]>;
  const mergedOptions: IOptions = {
    ...LITTLE_GLEN_SANITIZE_BASE,
    allowedAttributes: { ...LITTLE_GLEN_SANITIZE_BASE.allowedAttributes },
    allowedSchemesByTag: { ...baseSchemesByTag }
  };

  if (options.allowRemoteImages) {
    const baseImgSchemes = baseSchemesByTag?.img ?? [];
    mergedOptions.allowedSchemesByTag = {
      ...(mergedOptions.allowedSchemesByTag as Record<string, string[]>),
      img: Array.from(new Set([...baseImgSchemes, 'http', 'https']))
    };
  }

  return sanitizeHtml(markdown ?? '', mergedOptions);
}

/** Maximum log payload size (bytes) attached to feedback bodies. */
export const DEFAULT_LOG_BYTES_LIMIT = 64 * 1024; // 64KB

/** Maximum number of log lines collected by default. */
export const DEFAULT_LOG_LINE_LIMIT = 400;

export interface LogRedactionOptions {
  /** Absolute workspace paths to redact from logs. */
  workspacePaths?: string[];
}

/** Escape a string for safe use inside a RegExp constructor. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactWorkspacePaths(log: string, workspacePaths: string[]): string {
  return workspacePaths.reduce((current, workspacePath) => {
    if (!workspacePath) {
      return current;
    }

    const normalized = path.resolve(workspacePath);
    const variants = [normalized, normalized.replace(/\\/g, '/'), normalized.replace(/\//g, '\\')];

    return variants.reduce((acc, candidate) => {
      const pattern = new RegExp(escapeRegex(candidate), 'gi');
      return acc.replace(pattern, '<workspace>');
    }, current);
  }, log);
}

/**
 * Redact sensitive values from log text: tokens, emails, and absolute paths.
 * Only performs in-memory replacement; does not write back to disk.
 */
export function redactLogContent(log: string, options: LogRedactionOptions = {}): string {
  if (!log) {
    return '';
  }

  let cleaned = log;

  // Common token patterns (GitHub PATs, Slack tokens, JWTs, Bearer tokens)
  const tokenPatterns: Array<{ regex: RegExp; replacement: string | ((substring: string, ...args: any[]) => string) }> = [
    { regex: /(gh[pousr]_[A-Za-z0-9]{20,})/g, replacement: '<token>' },
    { regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g, replacement: '<token>' },
    { regex: /bearer\s+[A-Za-z0-9._~+/-]{10,}/gi, replacement: 'Bearer <redacted>' },
    { regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g, replacement: '<jwt>' },
    {
      regex: /((?:api[_-]?key|token|secret|password)\s*[=:]\s*)([A-Za-z0-9._-]{6,})/gi,
      replacement: (_match, prefix: string) => `${prefix}<redacted>`
    }
  ];

  for (const { regex, replacement } of tokenPatterns) {
    cleaned = cleaned.replace(regex as RegExp, replacement as any);
  }

  // Emails
  cleaned = cleaned.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>');

  // Workspace-specific absolute paths
  if (options.workspacePaths && options.workspacePaths.length > 0) {
    cleaned = redactWorkspacePaths(cleaned, options.workspacePaths);
  }

  // Generic absolute paths (POSIX and Windows). Avoids matching URLs by requiring whitespace/line start before the path.
  cleaned = cleaned.replace(/(^|[\s'"`])((?:[A-Za-z]:\\|\/)[^\s'"`]+(?:[\\/][^\s'"`]+)*)/g, (_match, prefix: string) => `${prefix}<path>`);

  return cleaned;
}

export interface TailResult {
  log: string;
  lines: number;
}

/** Return the last N lines from a log string (or entire string if shorter). */
export function tailLogLines(log: string, maxLines: number): TailResult {
  if (maxLines <= 0) {
    return { log: '', lines: 0 };
  }

  const segments = (log ?? '').split(/\r?\n/);
  if (segments.length <= maxLines) {
    return { log: segments.join('\n'), lines: segments.filter(Boolean).length };
  }

  const tail = segments.slice(-maxLines);
  return { log: tail.join('\n'), lines: tail.filter(Boolean).length };
}

export interface LogLimitResult {
  log: string;
  truncated: boolean;
  bytes: number;
}

/**
 * Enforce a maximum payload size (in bytes) for logs by trimming from the head.
 * Adds a truncation marker so users know data was clipped.
 */
export function limitLogPayload(log: string, maxBytes: number = DEFAULT_LOG_BYTES_LIMIT): LogLimitResult {
  const marker = '[[truncated]]\n';
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  const buffer = Buffer.from(log ?? '', 'utf8');

  if (buffer.byteLength <= maxBytes) {
    return { log, truncated: false, bytes: buffer.byteLength };
  }

  if (markerBytes >= maxBytes) {
    const clipped = marker.slice(0, Math.max(0, maxBytes));
    return { log: clipped, truncated: true, bytes: Buffer.byteLength(clipped, 'utf8') };
  }

  const slice = buffer.subarray(buffer.byteLength - (maxBytes - markerBytes));
  const limited = `${marker}${slice.toString('utf8')}`;
  return { log: limited, truncated: true, bytes: Buffer.byteLength(limited, 'utf8') };
}
