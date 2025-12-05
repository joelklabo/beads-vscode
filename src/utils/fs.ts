import * as path from 'path';
import { Buffer } from 'buffer';
import { LogRedactionOptions, redactLogContent as coreRedactLogContent } from '@beads/core';

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

export { LogRedactionOptions };

export function redactLogContent(log: string, options: LogRedactionOptions = {}): string {
  return coreRedactLogContent(log, options);
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

export function limitLogPayload(log: string, maxBytes: number = DEFAULT_LOG_BYTES_LIMIT): { log: string; truncated: boolean; bytes: number } {
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
