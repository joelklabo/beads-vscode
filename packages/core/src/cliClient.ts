import { execFile } from 'child_process';
import { promisify } from 'util';
import { CliExecutionPolicy, DEFAULT_CLI_POLICY, mergeCliPolicy } from './config';
import { sanitizeCliOutput } from './security/sanitize';

const execFileAsync = promisify(execFile);

export type BdCliErrorKind = 'timeout' | 'offline' | 'not_found' | 'cycle' | 'unknown';

export class BdCliError extends Error {
  constructor(
    message: string,
    public readonly kind: BdCliErrorKind,
    public readonly stdout?: string,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = 'BdCliError';
  }
}

export interface BdCliResult {
  stdout: string;
  stderr: string;
}

export interface BdCliClientOptions {
  commandPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  policy?: Partial<CliExecutionPolicy>;
  workspacePaths?: string[];
  worktreeId?: string;
  maxBufferBytes?: number;
  execImplementation?: (command: string, args: string[], options: ExecOptions) => Promise<BdCliResult>;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
  encoding?: BufferEncoding | 'utf8';
}

export interface ExecCliOptions {
  commandPath: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  policy: CliExecutionPolicy;
  maxBuffer?: number;
  workspacePaths?: string[];
  worktreeId?: string;
  execImplementation?: BdCliClientOptions['execImplementation'];
}

const NOT_FOUND_PATTERN = /not\s+found/i;
const CYCLE_PATTERN = /cycle/i;

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

export function buildSafeBdArgs(rawArgs: string[]): string[] {
  if (!Array.isArray(rawArgs)) {
    throw new Error('bd arguments must be an array');
  }

  const args = rawArgs.map((arg, index) => {
    if (typeof arg !== 'string') {
      throw new Error(`bd argument ${index} must be a string`);
    }
    if (arg.trim().length === 0) {
      throw new Error('bd arguments cannot be empty');
    }
    if (/\r|\n/.test(arg)) {
      throw new Error('bd arguments cannot contain newlines');
    }
    return arg;
  });
  return args.includes('--no-daemon') ? args : ['--no-daemon', ...args];
}

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

export function formatCliError(prefix: string, error: unknown, workspacePaths: string[] = [], worktreeId?: string): string {
  const combined = collectCliErrorOutput(error);
  const sanitized = sanitizeCliOutput(combined || String(error ?? ''), { workspacePaths, worktreeId });
  const message = sanitized.trim();
  return message ? `${prefix}: ${message}` : prefix;
}

export async function execCliWithPolicy(options: ExecCliOptions): Promise<BdCliResult> {
  const { commandPath, args, cwd, env, policy, maxBuffer, workspacePaths, worktreeId, execImplementation } = options;
  const started = Date.now();
  let attempt = 0;
  let lastError: unknown;

  const runner = execImplementation
    ? execImplementation
    : (cmd: string, cliArgs: string[], execOptions: ExecOptions) => execFileAsync(cmd, cliArgs, execOptions);

  while (attempt <= policy.retryCount) {
    try {
      return await runner(commandPath, args, {
        cwd,
        env,
        timeout: policy.timeoutMs,
        maxBuffer: maxBuffer ?? policy.maxBufferBytes ?? DEFAULT_CLI_POLICY.maxBufferBytes,
        encoding: 'utf8',
      });
    } catch (error) {
      lastError = error;
      attempt += 1;

      const elapsed = Date.now() - started;
      if (elapsed >= policy.offlineThresholdMs) {
        const offlineMessage = sanitizeCliOutput(
          collectCliErrorOutput(error) || 'bd command exceeded offline detection threshold',
          { workspacePaths, worktreeId }
        );
        throw new BdCliError(offlineMessage, 'offline', (error as any)?.stdout, (error as any)?.stderr);
      }

      if (attempt > policy.retryCount || !isRetriableError(error)) {
        const combined = sanitizeCliOutput(collectCliErrorOutput(error), { workspacePaths, worktreeId });
        const kind: BdCliErrorKind = isTimeoutError(error)
          ? 'timeout'
          : CYCLE_PATTERN.test(combined)
          ? 'cycle'
          : NOT_FOUND_PATTERN.test(combined)
          ? 'not_found'
          : 'unknown';
        throw new BdCliError(combined || 'bd command failed', kind, (error as any)?.stdout, (error as any)?.stderr);
      }

      const delayMs = policy.retryBackoffMs * attempt;
      if (delayMs > 0) {
        await delay(delayMs);
      }
    }
  }

  throw lastError ?? new BdCliError('bd command failed after retries.', 'unknown');
}

export interface BdCliRunOptions extends BdCliClientOptions {
  args?: string[];
}

export class BdCliClient {
  constructor(private readonly defaults: BdCliClientOptions = {}) {}

  private resolvePolicy(overrides?: Partial<CliExecutionPolicy>): CliExecutionPolicy {
    return mergeCliPolicy(overrides ?? this.defaults.policy);
  }

  private resolveCommandPath(commandPath?: string): string {
    return commandPath || this.defaults.commandPath || 'bd';
  }

  private resolveWorkspacePaths(workspacePaths?: string[]): string[] {
    return workspacePaths ?? this.defaults.workspacePaths ?? [];
  }

  private resolveWorktreeId(worktreeId?: string): string | undefined {
    return worktreeId ?? this.defaults.worktreeId;
  }

  async run(args: string[], options: BdCliRunOptions = {}): Promise<BdCliResult> {
    const policy = this.resolvePolicy(options.policy);
    const commandPath = this.resolveCommandPath(options.commandPath);
    const safeArgs = buildSafeBdArgs(args);
    return execCliWithPolicy({
      commandPath,
      args: safeArgs,
      cwd: options.cwd ?? this.defaults.cwd,
      env: options.env ?? this.defaults.env,
      policy,
      maxBuffer: options.maxBufferBytes ?? this.defaults.maxBufferBytes ?? policy.maxBufferBytes,
      workspacePaths: this.resolveWorkspacePaths(options.workspacePaths),
      worktreeId: this.resolveWorktreeId(options.worktreeId),
      execImplementation: options.execImplementation ?? this.defaults.execImplementation,
    });
  }

  async export(options?: BdCliRunOptions): Promise<BdCliResult> {
    return this.run(['export'], options);
  }

  async list(additionalArgs: string[] = [], options?: BdCliRunOptions): Promise<BdCliResult> {
    return this.run(['list', ...additionalArgs], options);
  }

  async update(id: string, updateArgs: string[], options?: BdCliRunOptions): Promise<BdCliResult> {
    return this.run(['update', id, ...updateArgs], options);
  }

  async label(action: 'add' | 'remove', id: string, label: string, options?: BdCliRunOptions): Promise<BdCliResult> {
    return this.run(['label', action, id, label], options);
  }
}

export interface CliVersion {
  raw: string;
  major: number;
  minor: number;
  patch: number;
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

export async function getCliVersion(commandPath = 'bd', cwd?: string): Promise<CliVersion> {
  const { stdout } = await execFileAsync(commandPath, ['--version'], { cwd });
  return parseCliVersion(stdout.toString());
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
  } catch {
    onWarn?.('Could not determine bd version; dependency editing may be unsupported.');
  }
}
