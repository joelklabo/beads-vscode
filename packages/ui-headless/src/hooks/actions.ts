import { buildSafeBdArgs } from '@beads/core';

export interface CliAdapterOptions {
  workspaceRoot?: string;
}

export interface CliAdapter {
  run: (args: string[], options?: CliAdapterOptions) => Promise<void>;
}

export interface HeadlessActions {
  updateStatus: (id: string, status: string) => Promise<void>;
  addLabel: (id: string, label: string) => Promise<void>;
  removeLabel: (id: string, label: string) => Promise<void>;
  addDependency: (sourceId: string, targetId: string) => Promise<void>;
  toggleFavorite: (id: string, label?: string) => Promise<void>;
}

export function createHeadlessActions(cli: CliAdapter | undefined, workspaceRoot?: string): HeadlessActions {
  const runCli = async (args: string[]): Promise<void> => {
    if (!cli) return;
    const safeArgs = buildSafeBdArgs(args);
    await cli.run(safeArgs, { workspaceRoot });
  };

  const updateStatus = async (id: string, status: string): Promise<void> => runCli(['update', id, '--status', status]);
  const addLabel = async (id: string, label: string): Promise<void> => runCli(['label', 'add', id, label]);
  const removeLabel = async (id: string, label: string): Promise<void> => runCli(['label', 'remove', id, label]);
  const addDependency = async (sourceId: string, targetId: string): Promise<void> => runCli(['dep', 'add', sourceId, targetId]);
  const toggleFavorite = async (id: string, label = 'favorite'): Promise<void> => {
    // Try to remove first; if nothing to remove, add label instead.
    await runCli(['label', 'remove', id, label]);
    await runCli(['label', 'add', id, label]);
  };

  return { updateStatus, addLabel, removeLabel, addDependency, toggleFavorite };
}
