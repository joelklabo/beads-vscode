import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export interface WorktreeEntry {
  id: string;               // worker/task-id
  name?: string;            // optional human label
  path: string;             // absolute path to worktree root
  branch: string;           // branch associated with the worktree
  commit?: string;          // HEAD sha
  lastSeen: number;         // epoch millis when entry was written
  lockedBy?: string;        // optional actor holding a lock
}

export interface WorktreeRegistry {
  entries: WorktreeEntry[];
  schemaVersion: number;
  generatedAt: number;
}

const REGISTRY_SCHEMA_VERSION = 1;

export const makeWorktreeId = (worker: string, taskId: string) => `${worker}/${taskId}`;

export const isCanonicalWorktreePath = (repoRoot: string, wtPath: string, id?: string) => {
  const absRoot = path.resolve(repoRoot);
  const absPath = path.resolve(wtPath);
  if (!absPath.startsWith(path.join(absRoot, '..', 'worktrees') + path.sep)) return false;
  if (!id) return true;
  return absPath.endsWith(`/${id}`);
};

const parsePorcelain = (text: string): WorktreeEntry[] => {
  const entries: WorktreeEntry[] = [];
  const lines = text.split(/\r?\n/);
  let current: Partial<WorktreeEntry> = {};

  const pushCurrent = () => {
    if (!current.path) return;
    current.lastSeen = Date.now();
    current.branch = current.branch || '';
    entries.push(current as WorktreeEntry);
    current = {};
  };

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      pushCurrent();
      current.path = line.replace('worktree ', '').trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch ', '').trim();
    } else if (line.startsWith('HEAD ')) {
      current.commit = line.replace('HEAD ', '').trim();
    }
  }
  pushCurrent();
  return entries;
};

export const buildRegistryFromGit = (repoRoot: string, now = Date.now()): WorktreeRegistry => {
  const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const entries = parsePorcelain(porcelain).map((e) => ({
    ...e,
    lastSeen: now,
  }));

  return {
    entries,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    generatedAt: now,
  };
};

export const registryPath = (repoRoot: string) => path.join(repoRoot, '.beads', 'worktrees.json');

export const writeRegistry = (repoRoot: string, registry: WorktreeRegistry) => {
  const target = registryPath(repoRoot);
  const tmp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2));
  fs.renameSync(tmp, target);
};

export const readRegistry = (repoRoot: string): WorktreeRegistry | null => {
  const file = registryPath(repoRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as WorktreeRegistry;
  } catch (err) {
    return null;
  }
};

export const formatWorktreeLabel = (entry: WorktreeEntry) => {
  const parts = [entry.id];
  if (entry.branch) parts.push(`(${entry.branch})`);
  return parts.join(' ');
};

export const filterStaleEntries = (entries: WorktreeEntry[], staleAfterMs: number) => {
  const cutoff = Date.now() - staleAfterMs;
  return entries.filter((e) => e.lastSeen >= cutoff);
};

export const syncRegistry = (repoRoot: string, staleAfterMs = 5 * 60 * 1000) => {
  const fresh = buildRegistryFromGit(repoRoot);
  fresh.entries = filterStaleEntries(fresh.entries, staleAfterMs);
  writeRegistry(repoRoot, fresh);
  return fresh;
};

export const currentWorktreeId = (repoRoot: string): string | undefined => {
  const match = repoRoot.match(/worktrees\/(.+?)\/(.+?)$/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  return undefined;
};

export type AuditIssue =
  | { type: 'missing_path'; path: string; id?: string }
  | { type: 'duplicate'; id: string; paths: string[] }
  | { type: 'unknown_id'; path: string };

export const auditWorktrees = (repoRoot: string, staleAfterMs = 5 * 60 * 1000) => {
  const now = Date.now();
  const fresh = buildRegistryFromGit(repoRoot, now);
  const issues: AuditIssue[] = [];

  const byId: Record<string, WorktreeEntry[]> = {};
  for (const entry of fresh.entries) {
    const match = entry.path.match(/worktrees\/([^/]+)\/([^/]+)$/);
    const derivedId = match ? `${match[1]}/${match[2]}` : null;
    const id = derivedId || entry.id || entry.branch;
    if (!id) {
      issues.push({ type: 'unknown_id', path: entry.path });
      continue;
    }
    entry.id = id;
    byId[id] = byId[id] || [];
    byId[id].push(entry);
  }

  for (const [id, list] of Object.entries(byId)) {
    if (list.length > 1) {
      issues.push({ type: 'duplicate', id, paths: list.map((e) => e.path) });
    }
  }

  const registry = readRegistry(repoRoot);
  if (registry) {
    const currentPaths = new Set(fresh.entries.map((e) => e.path));
    for (const entry of registry.entries) {
      if (!currentPaths.has(entry.path)) {
        issues.push({ type: 'missing_path', path: entry.path, id: entry.id });
      }
    }
  }

  const filtered = filterStaleEntries(fresh.entries, staleAfterMs);
  writeRegistry(repoRoot, { ...fresh, entries: filtered, generatedAt: now });

  return { issues, registry: { ...fresh, entries: filtered } };
};

export default {
  makeWorktreeId,
  isCanonicalWorktreePath,
  buildRegistryFromGit,
  registryPath,
  writeRegistry,
  readRegistry,
  formatWorktreeLabel,
  filterStaleEntries,
  syncRegistry,
};
