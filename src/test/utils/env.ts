import * as os from 'os';
import * as path from 'path';
import { mkdtemp } from 'fs/promises';
import { randomUUID } from 'crypto';

export type VsCodeChannel = 'stable' | 'insiders';

export interface TestEnv {
  userDataDir: string;
  extensionsDir: string;
  channel: VsCodeChannel;
  extraLaunchArgs: string[];
}

export async function buildTestEnv(): Promise<TestEnv> {
  const instanceId = process.env.VSCODE_TEST_INSTANCE_ID || randomUUID();
  const channel = (process.env.VSCODE_TEST_CHANNEL as VsCodeChannel) === 'insiders' ? 'insiders' : 'stable';

  const base = await mkdtemp(path.join(os.tmpdir(), `beads-vscode-${instanceId}-`));
  const userDataDir = path.join(base, 'user-data');
  const extensionsDir = path.join(base, 'extensions');

  // Additional args to avoid foregrounding windows on macOS/Windows
  const extraLaunchArgs = ['--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding'];

  return { userDataDir, extensionsDir, channel, extraLaunchArgs };
}
