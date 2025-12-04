import { execFile } from 'child_process';
import { promisify } from 'util';

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
  const { commandPath, args, cwd, env, policy, maxBuffer } = options;
  const started = Date.now();
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= policy.retryCount) {
    try {
      return await execFileAsync(commandPath, args, {
        cwd,
        env,
        timeout: policy.timeoutMs,
        maxBuffer: maxBuffer ?? policy.maxBufferBytes ?? 10 * 1024 * 1024,
        encoding: 'utf8',
      });
    } catch (error) {
      lastError = error;
      attempt += 1;

      const elapsed = Date.now() - started;
      if (elapsed >= policy.offlineThresholdMs) {
        const offlineError = new Error(
          `bd command exceeded offline detection threshold (${policy.offlineThresholdMs}ms)`
        );
        (offlineError as any).cause = error;
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
