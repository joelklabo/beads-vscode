/**
 * Core beads command handlers.
 *
 * These commands provide basic bead management operations:
 * - refresh: Refresh the beads view
 * - search: Open search input to filter beads
 * - clearSearch: Clear active search filter
 * - clearSortOrder: Reset to default sort order
 * - toggleClosedVisibility: Show/hide closed beads
 * - createBead: Create a new bead with a title
 * - selectWorkspace: Select active workspace in multi-root
 */

import * as vscode from 'vscode';
import { formatError } from '../utils';
import { resolveProjectRoot } from '../utils/workspace';
import { CommandDefinition } from './registry';

const t = vscode.l10n.t;

/**
 * Type for a function that runs bd CLI commands.
 */
export type RunBdCommandFn = (args: string[], projectRoot: string) => Promise<void>;

/**
 * Interface for provider with core bead operations.
 */
export interface CoreBeadsProvider {
  refresh(): Promise<void>;
  search(): Promise<void>;
  clearSearch(): void;
  clearSortOrder(): void;
  toggleClosedVisibility(): Promise<void>;
}

/**
 * Create a new bead with user-provided title.
 */
export async function createBead(runCommand: RunBdCommandFn): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: t('Enter a title for the new bead'),
    placeHolder: t('Implement feature X'),
  });

  if (!name) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beady');
  const projectRoot = resolveProjectRoot(config);

  if (!projectRoot) {
    void vscode.window.showErrorMessage(
      t('Beady: No project root configured. Set "beady.projectRoot" or open a workspace folder.')
    );
    return;
  }

  try {
    await runCommand(['create', name], projectRoot);
    void vscode.commands.executeCommand('beady.refresh');
    void vscode.window.showInformationMessage(t('Created bead: {0}', name));
  } catch (error) {
    void vscode.window.showErrorMessage(formatError(t('Failed to create bead'), error));
  }
}

/**
 * Create core beads command definitions with bound dependencies.
 *
 * Note: openBead, deleteBeads, and complex webview operations remain in
 * extension.main due to their deep integration with webview panels and
 * provider internals.
 */
export function createCoreBeadsCommands(
  provider: CoreBeadsProvider,
  runCommand: RunBdCommandFn
): CommandDefinition[] {
  return [
    {
      id: 'beady.refresh',
      handler: () => provider.refresh(),
      description: 'Refresh beads view',
    },
    {
      id: 'beady.search',
      handler: () => provider.search(),
      description: 'Search beads',
    },
    {
      id: 'beady.clearSearch',
      handler: () => {
        provider.clearSearch();
        return Promise.resolve();
      },
      description: 'Clear search filter',
    },
    {
      id: 'beady.clearSortOrder',
      handler: () => {
        provider.clearSortOrder();
        return Promise.resolve();
      },
      description: 'Reset sort order',
    },
    {
      id: 'beady.toggleClosedVisibility',
      handler: () => provider.toggleClosedVisibility(),
      description: 'Toggle closed beads visibility',
    },
    {
      id: 'beady.createBead',
      handler: () => createBead(runCommand),
      description: 'Create a new bead',
    },
  ];
}
