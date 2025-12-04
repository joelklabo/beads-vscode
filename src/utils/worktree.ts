import * as path from 'path';

/**
 * Redact absolute workspace paths from a log string. Handles POSIX and Windows separators
 * and normalizes alternate slash/backslash representations.
 */
export function redactWorkspacePaths(log: string, workspacePaths: string[]): string {
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
