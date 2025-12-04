import { Octokit } from '@octokit/rest';
import { Octokit } from '@octokit/rest';
import { Octokit } from '@octokit/rest';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  DEFAULT_LOG_BYTES_LIMIT,
  DEFAULT_LOG_LINE_LIMIT,
  limitLogPayload,
  redactLogContent,
  tailLogLines
} from './utils/fs';
import { FeedbackConfig, FeedbackLabelMap } from './utils/config';
import { collectEnvironmentInfo, EnvironmentInfo, formatEnvironmentMarkdown } from './utils/environment';
import { FeedbackConfig, FeedbackLabelMap } from './utils/config';
import { collectEnvironmentInfo, EnvironmentInfo, formatEnvironmentMarkdown } from './utils/environment';
import { FeedbackConfig, FeedbackLabelMap } from './utils/config';
import { collectEnvironmentInfo, EnvironmentInfo, formatEnvironmentMarkdown } from './utils/environment';

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
  'Privacy: Log sharing is OFF unless you opt in. When enabled, logs are sanitized (tokens/emails/paths removed) and capped at 64KB.';

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

export interface FeedbackErrorOptions {
  workspacePaths?: string[];
}

/**
 * Produce a user-safe error message for feedback submission. Redacts secrets and
 * replaces rate-limit/permission errors with friendly guidance.
 */
export function formatFeedbackError(error: unknown, options: FeedbackErrorOptions = {}): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const sanitized = redactLogContent(rawMessage, { workspacePaths: options.workspacePaths });

  const status = (error as any)?.status as number | undefined;
  if (status === 401 || /unauthorized/i.test(sanitized)) {
    return 'Feedback failed: unauthorized. Check your token or sign-in state.';
  }
  if (status === 403) {
    return 'Feedback failed: permission denied. Ensure you have access to the target repo/project.';
  }
  if (status === 429 || /rate limit/i.test(sanitized)) {
    return 'Feedback delayed: rate limit hit. Please wait and retry in a few minutes.';
  }

  return `Feedback failed: ${sanitized}`;
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

export type FeedbackType = 'bug' | 'feature' | 'question' | 'other' | string;

export interface FeedbackIssueInput extends LogCaptureOptions {
  summary: string;
  type?: FeedbackType;
  steps?: string;
  context?: string;
  expected?: string;
  actual?: string;
  labels?: string[];
  workspacePaths?: string[];
  environment?: Partial<EnvironmentInfo>;
  extensionId?: string;
  bdCommandPath?: string;
}

export interface FeedbackIssueResult {
  id?: string;
  url?: string;
  number?: number;
}

interface OctokitLike {
  issues: { create: (params: any) => Promise<{ data: any }> };
}

export interface CreateFeedbackIssueOptions {
  octokit?: OctokitLike;
  environmentResolver?: () => Promise<EnvironmentInfo>;
}

function normalizeLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function buildFeedbackLabels(
  type: string | undefined,
  labels: FeedbackLabelMap,
  extras: string[] = []
): string[] {
  const resolved: string[] = [];
  const normalizedType = type?.toLowerCase?.() ?? undefined;
  const mapped = normalizedType ? normalizeLabel(labels?.[normalizedType]) : undefined;
  if (mapped) {
    resolved.push(mapped);
  } else {
    const fallback = normalizeLabel(labels?.other ?? labels?.feedback);
    if (fallback) {
      resolved.push(fallback);
    }
  }

  for (const extra of extras) {
    const normalized = normalizeLabel(extra);
    if (normalized) {
      resolved.push(normalized);
    }
  }

  return Array.from(new Set(resolved));
}

function renderSection(title: string, content?: string): string {
  const body = content?.trim();
  return `## ${title}\n${body && body.length > 0 ? body : '_Not provided._'}`;
}

function buildIssueTemplate(input: FeedbackIssueInput, env: EnvironmentInfo): string {
  const blocks: string[] = [];
  blocks.push(renderSection('Summary', input.summary));
  const context = input.context ?? input.steps;
  blocks.push(renderSection('Steps / Context', context));

  const isBug = (input.type ?? '').toLowerCase() === 'bug';
  if (isBug || input.expected || input.actual) {
    blocks.push(renderSection('Expected', input.expected));
    blocks.push(renderSection('Actual', input.actual));
  }

  blocks.push(`## Environment\n${formatEnvironmentMarkdown(env, { type: input.type })}`);

  return blocks.join('\n\n');
}

export async function createFeedbackIssue(
  input: FeedbackIssueInput,
  authToken: string,
  config: FeedbackConfig,
  options: CreateFeedbackIssueOptions = {}
): Promise<FeedbackIssueResult> {
  if (!config?.owner || !config?.repo) {
    const reason = config?.validationError ?? 'feedback repository not configured';
    throw new Error(`Feedback configuration invalid: ${reason}`);
  }

  const resolveEnv =
    options.environmentResolver ??
    (() =>
      collectEnvironmentInfo({
        extensionId: input.extensionId,
        bdCommandPath: input.bdCommandPath,
        skipCliVersion: Boolean(input.environment?.beadsCli)
      }));

  const capturedEnv = await resolveEnv();
  const env: EnvironmentInfo = { ...capturedEnv, ...(input.environment ?? {}) };

  const baseBody = buildIssueTemplate(input, env);
  const includeLogs = Boolean(input.includeLogs && config.includeAnonymizedLogs !== false);
  const body = await buildFeedbackBody({
    baseBody,
    includeLogs,
    logPath: input.logPath,
    logDir: input.logDir,
    workspacePaths: input.workspacePaths,
    maxBytes: input.maxBytes,
    maxLines: input.maxLines,
    privacyNotice: input.privacyNotice
  });

  const labels = buildFeedbackLabels(input.type, config.labels, input.labels ?? []);
  const title = (input.summary ?? 'Feedback').split(/\r?\n/, 1)[0].trim() || 'Feedback';

  const octokit: OctokitLike =
    options.octokit ??
    new Octokit({
      auth: authToken,
      userAgent: 'beads-vscode-feedback'
    });

  try {
    const response = await octokit.issues.create({
      owner: config.owner!,
      repo: config.repo!,
      title,
      body,
      labels: labels.length > 0 ? labels : undefined
    });

    const data = response?.data ?? {};
    return {
      id: data.id?.toString?.() ?? data.node_id,
      number: data.number,
      url: data.html_url
    };
  } catch (error) {
    const friendly = formatFeedbackError(error, { workspacePaths: input.workspacePaths });
    console.error(friendly);
    throw new Error(friendly);
  }
}
