import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import {
  BeadsDocument,
  BeadsStore,
  BeadsStoreSnapshot,
  WorkspaceConfig,
  WorkspaceTarget,
  WorkspaceFavoritesConfig,
  WatchAdapter,
  WatcherManager,
  naturalSort,
  readBeadsDocument,
  saveBeadsDocument,
} from '@beads/core';
import { getCliExecutionConfig } from '../../utils';

const execFileAsync = promisify(execFile);

export {
  BeadsDocument,
  BeadsStore,
  BeadsStoreSnapshot,
  WorkspaceConfig,
  WorkspaceTarget,
  WorkspaceFavoritesConfig,
  WatcherManager,
  naturalSort,
  readBeadsDocument,
  saveBeadsDocument,
};

export interface WorkspaceTargetInput {
  workspaceId: string;
  projectRoot: string;
  config: vscode.WorkspaceConfiguration;
}

export function createWorkspaceTarget(input: WorkspaceTargetInput): WorkspaceTarget {
  const { workspaceId, projectRoot, config } = input;
  const commandPath = config.get<string>('commandPath', 'bd');
  const dataFile = config.get<string>('dataFile', '.beads/issues.jsonl');
  const policy = getCliExecutionConfig(config);
  const favoritesEnabled = config.get<boolean>('favorites.enabled', false);
  const favoritesLabel = config.get<string>('favorites.label');
  const favorites: WorkspaceFavoritesConfig = {
    enabled: favoritesEnabled,
    useLabelStorage: config.get<boolean>('favorites.useLabelStorage', true),
  };
  if (favoritesLabel) {
    favorites.label = favoritesLabel;
  }

  return {
    id: workspaceId,
    root: projectRoot,
    config: {
      commandPath,
      dataFile,
      policy,
      workspacePaths: [projectRoot],
      favorites,
    },
  };
}

export function createVsCodeWatchAdapter(): WatchAdapter {
  return {
    watch: (targetPath, listener) => {
      try {
        const isFile = path.extname(targetPath) !== '' && !targetPath.endsWith(path.sep);
        const base = isFile ? path.dirname(targetPath) : targetPath;
        const pattern = new vscode.RelativePattern(base, isFile ? path.basename(targetPath) : '**/*');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        const subs = [
          watcher.onDidChange((uri) => listener('change', uri.fsPath)),
          watcher.onDidCreate((uri) => listener('create', uri.fsPath)),
          watcher.onDidDelete((uri) => listener('delete', uri.fsPath)),
        ];

        return {
          dispose: () => {
            watcher.dispose();
            subs.forEach((s) => s.dispose());
          },
        };
      } catch (error) {
        console.warn('Failed to create VS Code watcher', error);
        return { dispose: () => undefined };
      }
    },
  };
}

export function createBeadsStore(options: { watchManager?: WatcherManager; watchAdapter?: WatchAdapter } = {}): BeadsStore {
  if (options.watchManager) {
    return new BeadsStore({ watchManager: options.watchManager });
  }

  const adapter = options.watchAdapter ?? createVsCodeWatchAdapter();
  return new BeadsStore({ watchAdapter: adapter });
}

export async function findBdCommand(configPath: string): Promise<string> {
  if (configPath && configPath !== 'bd') {
    return configPath;
  }

  try {
    await execFileAsync('bd', ['--version']);
    return 'bd';
  } catch {
    // fall through
  }

  const commonPaths = [
    '/opt/homebrew/bin/bd',
    '/usr/local/bin/bd',
    path.join(os.homedir(), '.local/bin/bd'),
    path.join(os.homedir(), 'go/bin/bd'),
  ];

  for (const candidate of commonPaths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('bd command not found. Please install beads CLI: https://github.com/steveyegge/beads');
}
