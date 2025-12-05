import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizeErrorMessage } from './format';

const execFileAsync = promisify(execFile);

export interface CliVersion {
  raw: string;
  major: number;
  minor: number;
  patch: number;
}

export interface CliExecutionPolicy {
  timeoutMs: number;
  retryCount: number;
  retryBackoffMs: number;
  offlineThresholdMs: number;
  maxBufferBytes?: number;
}

export interface ExecCliOptions {
  commandPath: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  policy: CliExecutionPolicy;
  maxBuffer?: number;
  redactPaths?: string[];
}

/**
 * Validate bd CLI arguments before execution. Enforces string-only args, blocks newlines,
 * and injects --no-daemon to keep calls in direct mode (avoids daemon state reuse).
 */
export function buildSafeBdArgs(rawArgs: string[]): string[] {
  if (!Array.isArray(rawArgs)) {
    throw new Error('bd arguments must be an array');
  }

  const args = rawArgs.map((arg, index) => {
    if (typeof arg !== 'string') {
      throw new Error(`bd argument ${index} must be a string`);
    }
    if (/\r|\n/.test(arg)) {
      throw new Error('bd arguments cannot contain newlines');
    }
    return arg;
  });

  return args.includes('--no-daemon') ? args : ['--no-daemon', ...args];
}

export function parseCliVersion(raw: string): CliVersion {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(/(\d+)\.(\d+)\.(\d+)/);
  const major = match ? parseInt(match[1], 10) : 0;
  const minor = match ? parseInt(match[2], 10) : 0;
  const patch = match ? parseInt(match[3], 10) : 0;
  return { raw: trimmed, major, minor, patch };
}

export function isCliVersionAtLeast(version: string | CliVersion, minimum: string | CliVersion): boolean {
  const v = typeof version === 'string' ? parseCliVersion(version) : version;
  const m = typeof minimum === 'string' ? parseCliVersion(minimum) : minimum;

  if (v.major !== m.major) return v.major > m.major;
  if (v.minor !== m.minor) return v.minor > m.minor;
  return v.patch >= m.patch;
}

export async function getCliVersion(commandPath: string, cwd?: string): Promise<CliVersion> {
  const { stdout } = await execFileAsync(commandPath, ['--version'], { cwd });
  return parseCliVersion(stdout.toString());
}

function isTimeoutError(error: any): boolean {
  const code = error?.code;
  const signal = error?.signal;
  const message: string = error?.message ?? '';
  return error?.killed === true || code === 'ETIMEDOUT' || signal === 'SIGTERM' || /timed out/i.test(message);
}

function isTransientProcessError(error: any): boolean {
  const code = error?.code;
  return code === 'ECONNRESET' || code === 'EPIPE' || code === 'EAI_AGAIN';
}

function isRetriableError(error: any): boolean {
  return isTimeoutError(error) || isTransientProcessError(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function execCliWithPolicy(options: ExecCliOptions): Promise<{ stdout: string; stderr: string }> {
  const { commandPath, args, cwd, env, policy, maxBuffer, redactPaths } = options;
  const safeArgs = buildSafeBdArgs(args);
  const redactionPaths = redactPaths ?? (cwd ? [cwd] : []);
  const started = Date.now();
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= policy.retryCount) {
    try {
      return await execFileAsync(commandPath, safeArgs, {
        cwd,
        env,
        timeout: policy.timeoutMs,
        maxBuffer: maxBuffer ?? policy.maxBufferBytes ?? 10 * 1024 * 1024,
        encoding: 'utf8',
      });
    } catch (error) {
      const sanitized = sanitizeErrorMessage(error, redactionPaths);
      (error as any).sanitizedMessage = sanitized;
      lastError = error;
      attempt += 1;

      const elapsed = Date.now() - started;
      if (elapsed >= policy.offlineThresholdMs) {
        const offlineError = new Error(
          `bd command exceeded offline detection threshold (${policy.offlineThresholdMs}ms)`
        );
        (offlineError as any).cause = error;
        (offlineError as any).sanitizedMessage = sanitized;
        throw offlineError;
      }

      if (attempt > policy.retryCount || !isRetriableError(error)) {
        throw error;
      }

      const delayMs = policy.retryBackoffMs * attempt;
      if (delayMs > 0) {
        await delay(delayMs);
      }
    }
  }

  throw lastError ?? new Error('CLI command failed after retries.');
}

export async function warnIfDependencyEditingUnsupported(
  commandPath: string,
  minVersion = '0.29.0',
  cwd?: string,
  onWarn?: (message: string) => void
): Promise<void> {
  try {
    const detected = await getCliVersion(commandPath, cwd);
    if (!isCliVersionAtLeast(detected, minVersion)) {
      const message = `Dependency editing requires bd >= ${minVersion} (found ${detected.raw || 'unknown'}). Update bd before enabling.`;
      onWarn?.(message);
    }
  } catch (error) {
    onWarn?.('Could not determine bd version; dependency editing may be unsupported.');
  }
}

/**
 * Combine message + stderr into a short, user-displayable string. Useful for surfacing bd failures.
 */
export function formatCliError(prefix: string, error: unknown): string {
  const message = typeof (error as any)?.message === 'string' ? (error as any).message.trim() : '';
  const stderr = typeof (error as any)?.stderr === 'string' ? (error as any).stderr.trim() : '';
  const combined = [message, stderr].filter(Boolean).join(' — ');
  return combined ? `${prefix}: ${combined}` : prefix;
}

/**
 * Raw combined message+stderr string for pattern matching (cycle/not-found detection, etc.).
 */
export function collectCliErrorOutput(error: unknown): string {
  const parts: string[] = [];
  const message = (error as any)?.message;
  const stderr = (error as any)?.stderr;
  if (typeof message === 'string') {
    parts.push(message);
  }
  if (typeof stderr === 'string') {
    parts.push(stderr);
  }
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}
