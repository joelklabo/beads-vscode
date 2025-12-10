/**
 * Favorites command handlers.
 *
 * These commands allow users to toggle favorite status on beads:
 * - toggleFavorite: Mark or unmark selected beads as favorites
 */

import * as vscode from 'vscode';
import { BeadItemData, BulkOperationFailure } from '../utils';
import {
  getFavoriteLabel,
  isValidFavoriteLabel,
  sanitizeFavoriteLabel,
  validateFavoriteTargets,
  getLocalFavorites,
  saveLocalFavorites,
  sanitizeFavoriteError,
} from '../utils/favorites';
import { resolveProjectRoot } from '../utils/workspace';
import { CommandDefinition } from './registry';

const t = vscode.l10n.t;

/** Error message for missing project root configuration. */
const PROJECT_ROOT_ERROR = 'Beady: No project root configured. Set "beady.projectRoot" or open a workspace folder.';

/**
 * Type for a function that runs bd CLI commands.
 */
export type RunBdCommandFn = (args: string[], projectRoot: string) => Promise<void>;

/**
 * Interface for tree items that represent beads.
 */
export interface BeadTreeItemLike {
  bead: BeadItemData;
}

/**
 * Interface for components that provide refresh capability.
 */
export interface RefreshableProvider {
  refresh(): Promise<void>;
}

/**
 * Type guard to check if an item is a bead tree item.
 */
function isBeadTreeItem(item: unknown): item is BeadTreeItemLike {
  return (
    item !== null &&
    typeof item === 'object' &&
    'bead' in item &&
    item.bead !== null &&
    typeof item.bead === 'object'
  );
}

/**
 * Toggle favorite status on selected beads.
 *
 * Supports both label-based storage (via bd CLI) and local-only storage
 * (using VS Code extension state). When label storage is enabled, the
 * command adds/removes a label on each bead; otherwise it just updates
 * the local favorites set.
 */
export async function toggleFavorites(
  provider: RefreshableProvider,
  treeView: vscode.TreeView<unknown> | undefined,
  context: vscode.ExtensionContext,
  runCommand: RunBdCommandFn
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const favoritesEnabled = config.get<boolean>('favorites.enabled', false);
  if (!favoritesEnabled) {
    void vscode.window.showWarningMessage(t('Enable "beady.favorites.enabled" to toggle favorites.'));
    return;
  }

  const useLabelStorage = config.get<boolean>('favorites.useLabelStorage', true);
  const favoriteLabelRaw = getFavoriteLabel(config);

  if (!isValidFavoriteLabel(favoriteLabelRaw)) {
    void vscode.window.showErrorMessage(
      t('Favorite label is invalid. Use letters, numbers, spaces, ".", ":", "_" or "-".')
    );
    return;
  }

  const favoriteLabel = sanitizeFavoriteLabel(favoriteLabelRaw);

  if (!treeView) {
    void vscode.window.showWarningMessage(t('Select one or more beads to toggle favorites.'));
    return;
  }

  const selection = treeView.selection.filter(isBeadTreeItem);
  if (selection.length === 0) {
    void vscode.window.showWarningMessage(t('Select one or more beads to toggle favorites.'));
    return;
  }

  const { valid, invalidIds, duplicateIds } = validateFavoriteTargets(selection.map((item) => item.bead));

  if (invalidIds.length > 0) {
    void vscode.window.showErrorMessage(t('Invalid bead id(s): {0}', invalidIds.join(', ')));
  }

  if (duplicateIds.length > 0) {
    void vscode.window.showWarningMessage(t('Ignoring duplicate selection(s): {0}', duplicateIds.join(', ')));
  }

  if (valid.length === 0) {
    return;
  }

  const projectRoot = resolveProjectRoot(config);
  if (useLabelStorage && !projectRoot) {
    void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
    return;
  }

  const localFavorites = getLocalFavorites(context);
  const successes: string[] = [];
  const failures: BulkOperationFailure[] = [];
  let toggledOn = 0;
  let toggledOff = 0;

  for (const bead of valid) {
    const labels: string[] = Array.isArray((bead.raw as Record<string, unknown>)?.labels)
      ? (bead.raw as Record<string, unknown>).labels as string[]
      : [];
    const hasLabel = labels.includes(favoriteLabel);
    const isFavorite = hasLabel || localFavorites.has(bead.id);
    const targetFavorite = !isFavorite;

    const applyLocal = (): void => {
      if (targetFavorite) {
        localFavorites.add(bead.id);
        toggledOn += 1;
      } else {
        localFavorites.delete(bead.id);
        toggledOff += 1;
      }
    };

    try {
      if (useLabelStorage) {
        const action = targetFavorite ? 'add' : 'remove';
        await runCommand(['label', action, bead.id, favoriteLabel], projectRoot!);
      }

      applyLocal();
      successes.push(bead.id);
    } catch (error) {
      applyLocal();
      const message = sanitizeFavoriteError(error, projectRoot ? [projectRoot] : []);
      failures.push({ id: bead.id, error: message });
    }
  }

  await saveLocalFavorites(context, localFavorites);
  await provider.refresh();

  if (failures.length === 0) {
    if (toggledOn || toggledOff) {
      if (toggledOn && toggledOff) {
        void vscode.window.showInformationMessage(
          t('Updated favorites: {0} added, {1} removed.', toggledOn, toggledOff)
        );
      } else if (toggledOn) {
        void vscode.window.showInformationMessage(t('Marked {0} bead(s) as favorite', toggledOn));
      } else {
        void vscode.window.showInformationMessage(t('Removed favorite from {0} bead(s)', toggledOff));
      }
    }
    return;
  }

  const failureList = failures.map((failure) => `${failure.id}: ${failure.error}`).join('; ');
  if (successes.length === 0) {
    void vscode.window.showErrorMessage(
      t('Failed to update favorites for {0} bead(s): {1}', failures.length, failureList)
    );
  } else {
    void vscode.window.showWarningMessage(
      t('Updated {0} bead(s); failed for {1}: {2}', successes.length, failures.length, failureList)
    );
  }
}

/**
 * Create favorites command definitions with bound dependencies.
 */
export function createFavoritesCommands(
  provider: RefreshableProvider,
  treeView: vscode.TreeView<unknown> | undefined,
  context: vscode.ExtensionContext,
  runCommand: RunBdCommandFn
): CommandDefinition[] {
  return [
    {
      id: 'beady.toggleFavorite',
      handler: () => toggleFavorites(provider, treeView, context, runCommand),
      description: 'Toggle favorite status on selected beads',
    },
  ];
}
