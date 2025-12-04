import * as path from 'path';
import { Buffer } from 'buffer';
import { redactWorkspacePaths } from './worktree';

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

export const DEFAULT_LOG_BYTES_LIMIT = 64 * 1024; // 64KB
export const DEFAULT_LOG_LINE_LIMIT = 400;

export interface LogRedactionOptions {
  workspacePaths?: string[];
}

export interface LogLimitResult {
  log: string;
  truncated: boolean;
  bytes: number;
}

function redactAbsolutePaths(log: string): string {
  return log.replace(/(^|[\s'"`])((?:[A-Za-z]:\\|\/)[^\s'"`]+(?:[\\/][^\s'"`]+)*)/g, (_match, prefix: string) => `${prefix}<path>`);
}

export function redactLogContent(log: string, options: LogRedactionOptions = {}): string {
  if (!log) {
    return '';
  }

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

  cleaned = redactAbsolutePaths(cleaned);

  return cleaned;
}

export function tailLogLines(log: string, maxLines: number): { log: string; lines: number } {
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
