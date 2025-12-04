import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

export async function getCliVersion(commandPath: string, cwd?: string): Promise<CliVersion> {
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
  } catch (error) {
    onWarn?.('Could not determine bd version; dependency editing may be unsupported.');
  }
}
