import { execFile } from 'child_process';
import * as os from 'os';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export interface EnvironmentInfo {
  os: string;
  vscode: string;
  extension: string;
  beadsCli?: string;
  node?: string;
}

export interface EnvironmentOptions {
  extensionId?: string;
  bdCommandPath?: string;
  skipCliVersion?: boolean;
}

async function detectBdCliVersion(commandPath?: string): Promise<string | undefined> {
  const cmd = commandPath && commandPath.trim().length > 0 ? commandPath.trim() : 'bd';
  try {
    const { stdout } = await execFileAsync(cmd, ['--version'], { timeout: 5000 });
    const firstLine = stdout?.trim().split(/\r?\n/, 1)[0];
    return firstLine && firstLine.length > 0 ? firstLine : undefined;
  } catch {
    return undefined;
  }
}

export async function collectEnvironmentInfo(options: EnvironmentOptions = {}): Promise<EnvironmentInfo> {
  const osInfo = `${os.platform()} ${os.release()} (${os.arch()})`;
  const vscodeVersion = (vscode as any)?.version ?? 'unknown';
  const extensionId = options.extensionId ?? 'klabo.beady';
  const extensionVersion =
    vscode.extensions?.getExtension?.(extensionId)?.packageJSON?.version ?? 'unknown';

  let beadsCli = 'unavailable';
  if (!options.skipCliVersion) {
    beadsCli = (await detectBdCliVersion(options.bdCommandPath)) ?? 'unavailable';
  }

  return {
    os: osInfo,
    vscode: vscodeVersion,
    extension: extensionVersion,
    beadsCli,
    node: process.version
  };
}

export function formatEnvironmentMarkdown(
  info: EnvironmentInfo,
  extras: { type?: string } = {}
): string {
  const lines: string[] = [];

  if (extras.type) {
    lines.push(`- Type: ${extras.type}`);
  }
  if (info.os) {
    lines.push(`- OS: ${info.os}`);
  }
  if (info.vscode) {
    lines.push(`- VS Code: ${info.vscode}`);
  }
  if (info.extension) {
    lines.push(`- Extension: ${info.extension}`);
  }
  if (info.beadsCli) {
    lines.push(`- Beads CLI: ${info.beadsCli}`);
  }
  if (info.node) {
    lines.push(`- Node: ${info.node}`);
  }

  return lines.length > 0 ? lines.join('\n') : '_Not collected._';
}
