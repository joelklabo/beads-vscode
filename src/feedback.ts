import { promises as fs } from 'fs';
import * as path from 'path';
import {
  DEFAULT_LOG_BYTES_LIMIT,
  DEFAULT_LOG_LINE_LIMIT,
  limitLogPayload,
  redactLogContent,
  tailLogLines
} from './utils';

export interface LogCaptureOptions {
  /** Explicit path to a log file to attach. */
  logPath?: string;
  /** Directory containing log files; the most recent .log file will be selected. */
  logDir?: string;
  /** Optional workspace roots for path redaction. */
  workspacePaths?: string[];
  /** Max lines to collect from the tail of the log file. */
  maxLines?: number;
  /** Max size of the attached log payload (bytes). */
  maxBytes?: number;
  /** Whether the user opted in to include logs. Defaults to false. */
  includeLogs?: boolean;
  /** Optional custom privacy notice. */
  privacyNotice?: string;
}

export interface LogCaptureResult {
  content?: string;
  truncated: boolean;
  bytes: number;
  lines: number;
  error?: string;
}

export const FEEDBACK_PRIVACY_NOTICE =
  'Privacy: Logs are optional and sanitized to remove tokens, emails, and absolute paths. Size capped at 64KB.';

async function pickLatestLog(logDir: string): Promise<string | undefined> {
  try {
    const entries = await fs.readdir(logDir, { withFileTypes: true });
    const logFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.log'));
    if (logFiles.length === 0) {
      return undefined;
    }

    const stats = await Promise.all(
      logFiles.map(async (entry) => {
        const filePath = path.join(logDir, entry.name);
        const stat = await fs.stat(filePath);
        return { filePath, mtime: stat.mtimeMs };
      })
    );

    const latest = stats.sort((a, b) => b.mtime - a.mtime)[0];
    return latest?.filePath;
  } catch {
    return undefined;
  }
}

async function resolveLogPath(options: LogCaptureOptions): Promise<string | undefined> {
  if (options.logPath) {
    try {
      await fs.access(options.logPath);
      return options.logPath;
    } catch {
      return undefined;
    }
  }

  if (options.logDir) {
    return pickLatestLog(options.logDir);
  }

  return undefined;
}

/**
 * Read, tail, redact, and size-limit extension logs for feedback attachments.
 * Does not throw; errors are returned in the result so feedback submission can continue.
 */
export async function captureLogs(options: LogCaptureOptions): Promise<LogCaptureResult> {
  const maxLines = options.maxLines ?? DEFAULT_LOG_LINE_LIMIT;
  const maxBytes = options.maxBytes ?? DEFAULT_LOG_BYTES_LIMIT;

  const targetPath = await resolveLogPath(options);
  if (!targetPath) {
    return { truncated: false, bytes: 0, lines: 0, error: 'No log file found' };
  }

  try {
    const raw = await fs.readFile(targetPath, 'utf8');
    const tailed = tailLogLines(raw, maxLines);
    const sanitized = redactLogContent(tailed.log, { workspacePaths: options.workspacePaths });
    const limited = limitLogPayload(sanitized, maxBytes);

    return {
      content: limited.log,
      truncated: limited.truncated,
      bytes: limited.bytes,
      lines: tailed.lines
    };
  } catch (error: any) {
    return { truncated: false, bytes: 0, lines: 0, error: error?.message ?? 'Unable to read logs' };
  }
}

export interface FeedbackBodyOptions extends LogCaptureOptions {
  /** Base body entered by the user. */
  baseBody: string;
}

export async function buildFeedbackBody(options: FeedbackBodyOptions): Promise<string> {
  const notice = options.privacyNotice ?? FEEDBACK_PRIVACY_NOTICE;
  const baseBody = options.baseBody?.trim() ?? '';
  let composed = `${notice}\n\n${baseBody}`.trim();

  if (!options.includeLogs) {
    return `${composed}\n\n_Log attachment: skipped (opt-out)._`;
  }

  const result = await captureLogs(options);
  if (!result.content) {
    const reason = result.error ?? 'No logs available';
    return `${composed}\n\n_Log attachment unavailable: ${reason}._`;
  }

  const descriptor = `Sanitized logs (last ${result.lines} lines, ${result.bytes} bytes${
    result.truncated ? ', truncated to limit' : ''
  })`;

  composed += `\n\n---\n${descriptor}\n\n\`\`\`\n${result.content}\n\`\`\``;
  return composed;
}
