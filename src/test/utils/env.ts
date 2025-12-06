import * as path from 'path';
import { mkdtemp, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';

export type VsCodeChannel = 'stable' | 'insiders';

export interface TestEnv {
  userDataDir: string;
  extensionsDir: string;
  channel: VsCodeChannel;
  extraLaunchArgs: string[];
}

const INSTANCE_ID_MAX = 64;
const WORKSPACE_TMP = path.join(path.resolve(__dirname, '../../..'), 'tmp');

function parseChannel(value: string | undefined): VsCodeChannel {
  if (!value) {
    return 'stable';
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'insiders' ? 'insiders' : 'stable';
}

function sanitizeInstanceId(raw: string | undefined): string {
  const fallback = randomUUID();
  if (!raw) {
    return fallback;
  }

  const noSeparators = raw.replace(/[\\/]/g, '-');
  const safe = noSeparators.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, INSTANCE_ID_MAX);
  const collapsed = safe.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');

  return collapsed || fallback;
}

export async function buildTestEnv(): Promise<TestEnv> {
  const instanceId = sanitizeInstanceId(process.env.VSCODE_TEST_INSTANCE_ID);
  const channel = parseChannel(process.env.VSCODE_TEST_CHANNEL);

  await mkdir(WORKSPACE_TMP, { recursive: true });
  const base = await mkdtemp(path.join(WORKSPACE_TMP, `beady-${instanceId}-`));
  const userDataDir = path.join(base, 'user-data');
  const extensionsDir = path.join(base, 'extensions');

  // Additional args to avoid foregrounding windows on macOS/Windows
  const extraLaunchArgs = ['--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding'];

  return { userDataDir, extensionsDir, channel, extraLaunchArgs };
}
