import * as path from 'path';

export interface LogRedactionOptions {
  workspacePaths?: string[];
  worktreeId?: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactWorkspacePaths(log: string, workspacePaths: string[] = []): string {
  return workspacePaths.reduce((current, workspacePath) => {
    if (!workspacePath) return current;

    const normalized = path.resolve(workspacePath);
    const variants = [normalized, normalized.replace(/\\/g, '/'), normalized.replace(/\//g, '\\')];

    return variants.reduce((acc, candidate) => {
      const pattern = new RegExp(escapeRegex(candidate), 'gi');
      return acc.replace(pattern, '<workspace>');
    }, current);
  }, log);
}

function redactAbsolutePaths(log: string): string {
  return log.replace(/(^|[\s'"`])((?:[A-Za-z]:\\|\/)[^\s'"`]+(?:[\\/][^\s'"`]+)*)/g, (_match, prefix: string) => `${prefix}<path>`);
}

/**
 * Redact sensitive tokens, emails, workspace/worktree identifiers, and absolute paths
 * from raw CLI output or logs. Keeps the text readable while stripping secrets.
 */
export function redactLogContent(log: string, options: LogRedactionOptions = {}): string {
  if (!log) return '';

  let cleaned = log;

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

  cleaned = cleaned.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>');

  if (options.workspacePaths && options.workspacePaths.length > 0) {
    cleaned = redactWorkspacePaths(cleaned, options.workspacePaths);
  }

  if (options.worktreeId) {
    const pattern = new RegExp(escapeRegex(options.worktreeId), 'gi');
    cleaned = cleaned.replace(pattern, '<worktree>');
  }

  cleaned = redactAbsolutePaths(cleaned);

  return cleaned;
}

export function sanitizeCliOutput(raw: string, options: LogRedactionOptions = {}): string {
  if (!raw) return raw;
  return redactLogContent(raw, options).replace(/\s+/g, ' ').trim();
}

export function sanitizeErrorMessage(error: unknown, options: LogRedactionOptions = {}): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return sanitizeCliOutput(raw, options);
}
