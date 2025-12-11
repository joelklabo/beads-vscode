import { promises as fs } from 'fs';
import * as path from 'path';
import { BdCliClient } from '../cliClient';
import { CliExecutionPolicy, DEFAULT_CLI_POLICY, mergeCliPolicy } from '../config';
import { BeadItemData, extractBeads, normalizeBead } from '../beads';
import { WatchAdapter, WatcherManager, WatchSubscription } from './watchers';

export interface BeadsDocument {
  filePath: string;
  root: unknown;
  beads: any[];
  watchPaths?: string[];
}

export interface WorkspaceFavoritesConfig {
  enabled: boolean;
  label?: string;
  useLabelStorage?: boolean;
}

export interface WorkspaceConfig {
  commandPath?: string;
  dataFile?: string;
  policy?: Partial<CliExecutionPolicy>;
  workspacePaths?: string[];
  maxBufferBytes?: number;
  favorites?: WorkspaceFavoritesConfig;
}

export interface WorkspaceTarget {
  id: string;
  root: string;
  config?: WorkspaceConfig;
}

export interface WorkspaceState {
  target: WorkspaceTarget;
  items: BeadItemData[];
  document?: BeadsDocument;
  refreshInProgress: boolean;
  pendingRefresh: boolean;
  watchers: WatchSubscription[];
}

export interface BeadsStoreSnapshot {
  items: BeadItemData[];
  workspaces: WorkspaceState[];
}

export interface BeadsStoreOptions {
  watchAdapter?: WatchAdapter;
  watchManager?: WatcherManager;
  watchDebounceMs?: number;
  loader?: (target: WorkspaceTarget) => Promise<{ items: BeadItemData[]; document: BeadsDocument }>;
  staleThresholdHours?: number;
  clock?: () => number;
  onError?: (error: unknown) => void;
}

export const DEFAULT_STALE_THRESHOLD_HOURS = 24;

export function isStale(
  bead: BeadItemData,
  thresholdHours: number = DEFAULT_STALE_THRESHOLD_HOURS,
  now: number = Date.now()
): boolean {
  if (bead.status !== 'in_progress' || !bead.inProgressSince) {
    return false;
  }

  const started = new Date(bead.inProgressSince).getTime();
  if (Number.isNaN(started)) {
    return false;
  }

  const diffHours = (now - started) / (1000 * 60 * 60);
  return diffHours >= thresholdHours;
}

export function getStaleInfo(
  bead: BeadItemData,
  now: number = Date.now()
): { hoursInProgress: number; formattedTime: string } | undefined {
  if (bead.status !== 'in_progress' || !bead.inProgressSince) {
    return undefined;
  }

  const started = new Date(bead.inProgressSince).getTime();
  if (Number.isNaN(started)) {
    return undefined;
  }

  const diffMs = now - started;
  const hoursInProgress = diffMs / (1000 * 60 * 60);

  const days = Math.floor(hoursInProgress / 24);
  const hours = Math.floor(hoursInProgress % 24);

  let formattedTime: string;
  if (days > 0) {
    formattedTime = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } else if (hours > 0) {
    formattedTime = `${hours}h`;
  } else {
    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
    formattedTime = `${minutes}m`;
  }

  return { hoursInProgress, formattedTime };
}

export function naturalSort(a: BeadItemData, b: BeadItemData): number {
  const aParts = a.id.split(/(\d+)/);
  const bParts = b.id.split(/(\d+)/);

  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];

    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      if (aNum !== bNum) {
        return aNum - bNum;
      }
    } else if (aPart !== bPart) {
      return aPart.localeCompare(bPart);
    }
  }

  return aParts.length - bParts.length;
}

export function resolveDataFilePath(dataFile: string, projectRoot: string | undefined): string | undefined {
  if (!dataFile || dataFile.trim().length === 0) {
    return undefined;
  }

  if (path.isAbsolute(dataFile)) {
    return dataFile;
  }

  if (!projectRoot) {
    return undefined;
  }

  return path.join(projectRoot, dataFile);
}

export async function readBeadsDocument(filePath: string): Promise<BeadsDocument> {
  const rawContent = await fs.readFile(filePath, 'utf8');

  if (filePath.endsWith('.jsonl')) {
    const lines = rawContent
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0);
    const beads = lines.map((line) => JSON.parse(line));
    return { filePath, root: beads, beads, watchPaths: [filePath] };
  }

  const root = JSON.parse(rawContent);
  const beads = extractBeads(root);
  if (!Array.isArray(beads)) {
    throw new Error('Beads data file does not contain a beads array.');
  }

  return { filePath, root, beads, watchPaths: [filePath] };
}

export async function saveBeadsDocument(document: BeadsDocument): Promise<void> {
  if (document.filePath.endsWith('.jsonl')) {
    const lines = document.beads.map((bead) => JSON.stringify(bead)).join('\n');
    const content = lines.endsWith('\n') ? lines : `${lines}\n`;
    await fs.writeFile(document.filePath, content, 'utf8');
    return;
  }

  const serialized = JSON.stringify(document.root, null, 2);
  const content = serialized.endsWith('\n') ? serialized : `${serialized}\n`;
  await fs.writeFile(document.filePath, content, 'utf8');
}

export function filterBeadsByQuery(items: BeadItemData[], query: string | undefined): BeadItemData[] {
  if (!query) {
    return items;
  }

  const normalized = query.toLowerCase();
  return items.filter((item) => {
    const raw = item.raw as any;
    const searchableFields = [
      item.id,
      item.title,
      raw?.description || '',
      raw?.design || '',
      raw?.acceptance_criteria || '',
      raw?.notes || '',
      raw?.assignee || '',
      item.status || '',
      raw?.issue_type || '',
      ...(raw?.labels || []),
      ...(item.tags || []),
    ];

    return searchableFields.some((field) => String(field).toLowerCase().includes(normalized));
  });
}

type LoadResult = { items: BeadItemData[]; document: BeadsDocument };

export class BeadsStore {
  private readonly watchManager?: WatcherManager;
  private readonly ownsWatchManager: boolean;
  private readonly loader: (target: WorkspaceTarget) => Promise<LoadResult>;
  private readonly listeners = new Set<(snapshot: BeadsStoreSnapshot) => void>();
  private readonly workspaceState = new Map<string, WorkspaceState>();
  private readonly clock: () => number;
  private readonly staleThresholdHours: number;

  constructor(private readonly options: BeadsStoreOptions = {}) {
    if (options.watchManager) {
      this.watchManager = options.watchManager;
      this.ownsWatchManager = false;
    } else if (options.watchAdapter) {
      this.watchManager = new WatcherManager(options.watchAdapter, { debounceMs: options.watchDebounceMs });
      this.ownsWatchManager = true;
    } else {
      this.watchManager = undefined;
      this.ownsWatchManager = false;
    }

    this.loader = options.loader ?? ((target) => this.loadWorkspace(target));
    this.clock = options.clock ?? Date.now;
    this.staleThresholdHours = options.staleThresholdHours ?? DEFAULT_STALE_THRESHOLD_HOURS;
  }

  onDidChange(listener: (snapshot: BeadsStoreSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): BeadsStoreSnapshot {
    const workspaces = Array.from(this.workspaceState.values());
    const items = workspaces.flatMap((ws) => ws.items);
    items.sort(naturalSort);
    return { items, workspaces };
  }

  getItems(): BeadItemData[] {
    return this.getSnapshot().items;
  }

  getStaleItems(thresholdHours: number = this.staleThresholdHours): BeadItemData[] {
    return this.getSnapshot().items.filter((item) => isStale(item, thresholdHours, this.clock()));
  }

  dispose(): void {
    for (const state of this.workspaceState.values()) {
      this.disposeWatchers(state);
    }
    this.workspaceState.clear();

    if (this.ownsWatchManager && this.watchManager) {
      this.watchManager.dispose();
    }
  }

  async refresh(workspaces: WorkspaceTarget[]): Promise<BeadsStoreSnapshot> {
    const validTargets = workspaces.filter((ws) => ws && ws.root);
    if (validTargets.length === 0) {
      for (const state of this.workspaceState.values()) {
        this.disposeWatchers(state);
      }
      this.workspaceState.clear();
      const snapshot = this.getSnapshot();
      this.notify(snapshot);
      return snapshot;
    }

    const refreshPromises = validTargets.map((target) => this.refreshWorkspace(target));
    await Promise.all(refreshPromises);
    const snapshot = this.getSnapshot();
    this.notify(snapshot);
    return snapshot;
  }

  private async refreshWorkspace(target: WorkspaceTarget): Promise<void> {
    const state = this.ensureWorkspaceState(target);

    if (state.refreshInProgress) {
      state.pendingRefresh = true;
      return;
    }

    state.refreshInProgress = true;
    try {
      const result = await this.loader(state.target);
      state.items = result.items;
      state.document = result.document;
      this.configureWatchers(state);
    } catch (error) {
      state.items = [];
      state.document = undefined;
      this.options.onError?.(error);
    }

    const hadPendingRefresh = state.pendingRefresh;
    state.pendingRefresh = false;
    state.refreshInProgress = false;

    if (hadPendingRefresh) {
      await this.refreshWorkspace(state.target);
      return;
    }

    this.notify(this.getSnapshot());
  }

  private ensureWorkspaceState(target: WorkspaceTarget): WorkspaceState {
    const existing = this.workspaceState.get(target.id);
    if (existing) {
      existing.target = target;
      return existing;
    }

    const state: WorkspaceState = {
      target,
      items: [],
      document: undefined,
      refreshInProgress: false,
      pendingRefresh: false,
      watchers: [],
    };
    this.workspaceState.set(target.id, state);
    return state;
  }

  private configureWatchers(state: WorkspaceState): void {
    if (!this.watchManager) {
      return;
    }

    this.disposeWatchers(state);

    const watchPaths = state.document?.watchPaths ?? [];
    for (const watchPath of watchPaths) {
      const sub = this.watchManager.watch(watchPath, () => {
        void this.refreshWorkspace(state.target);
      });
      state.watchers.push(sub);
    }
  }

  private disposeWatchers(state: WorkspaceState): void {
    for (const watcher of state.watchers) {
      watcher.dispose();
    }
    state.watchers = [];
  }

  private notify(snapshot: BeadsStoreSnapshot): void {
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async loadWorkspace(target: WorkspaceTarget): Promise<LoadResult> {
    if (!target.root) {
      throw new Error('Workspace root is required to load beads.');
    }

    try {
      return await this.loadFromCli(target);
    } catch (error) {
      return this.loadFromFile(target, error);
    }
  }

  private async loadFromCli(target: WorkspaceTarget): Promise<LoadResult> {
    const config = target.config ?? {};
    const policy = mergeCliPolicy(config.policy, DEFAULT_CLI_POLICY);
    const client = new BdCliClient({
      commandPath: config.commandPath,
      cwd: target.root,
      policy,
      workspacePaths: config.workspacePaths ?? [target.root],
      maxBufferBytes: config.maxBufferBytes ?? policy.maxBufferBytes,
    });

    const { stdout } = await client.export({ maxBufferBytes: config.maxBufferBytes ?? policy.maxBufferBytes });
    const beads = parseJsonLines(stdout);
    const items = beads.map((entry, index) => normalizeBead(entry, index));
    items.sort(naturalSort);
    const dbPath = path.join(target.root, '.beads');
    const document: BeadsDocument = { filePath: dbPath, root: beads, beads, watchPaths: [dbPath] };
    return { items, document };
  }

  private async loadFromFile(target: WorkspaceTarget, reason?: unknown): Promise<LoadResult> {
    const config = target.config ?? {};
    const dataFileConfig = config.dataFile ?? '.beads/issues.jsonl';
    const resolvedDataFile = resolveDataFilePath(dataFileConfig, target.root);

    if (!resolvedDataFile) {
      const message = 'Unable to resolve beads data file. Provide an absolute path or set projectRoot.';
      throw reason ?? new Error(message);
    }

    const document = await readBeadsDocument(resolvedDataFile);
    const items = document.beads.map((entry, index) => normalizeBead(entry, index));
    items.sort(naturalSort);
    return { items, document };
  }
}

function parseJsonLines(stdout: string): any[] {
  if (!stdout || !stdout.trim()) {
    return [];
  }

  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
