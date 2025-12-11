/**
 * Dependency editing command handlers.
 *
 * These commands allow users to manage dependencies between beads:
 * - addDependency: Add a dependency from source to target bead
 * - removeDependency: Remove an existing dependency
 * - dependencyTree.pickRoot: Select a bead as the dependency tree root
 * - dependencyTree.addUpstream: Add upstream dependency from tree view
 * - dependencyTree.addDownstream: Add downstream dependency from tree view
 * - dependencyTree.remove: Remove dependency from tree view
 * - visualizeDependencies: Open dependency graph visualization
 *
 * Note: Most dependency operations remain in extension.main due to complex
 * provider and webview interactions. This module provides a structured
 * interface for future extraction.
 */

import * as vscode from 'vscode';
import { BeadItemData, sanitizeDependencyId, validateDependencyAdd, collectDependencyEdges, GraphEdgeData } from '../utils';
import { CommandDefinition } from './registry';

const t = vscode.l10n.t;

/** Warning message for invalid dependency IDs. */
const INVALID_ID_MESSAGE = 'Invalid bead ID. IDs must be alphanumeric with dashes.';

type BeadQuickPick = vscode.QuickPickItem & { bead: BeadItemData };
type EdgeQuickPick = vscode.QuickPickItem & { edge: GraphEdgeData };

/**
 * Interface for provider with dependency editing capabilities.
 */
export interface DependencyEditProvider {
  addDependency(source: BeadItemData, targetId: string): Promise<void>;
  removeDependency(sourceId: string, targetId: string): Promise<void>;
  /** Internal items array - accessed for dependency lookup */
  readonly items?: BeadItemData[];
}

/**
 * Pick a bead from a quick pick list.
 */
async function pickBeadQuick(
  items: BeadItemData[] | undefined,
  placeHolder: string,
  excludeId?: string
): Promise<BeadItemData | undefined> {
  if (!items || items.length === 0) {
    void vscode.window.showWarningMessage(t('No beads are loaded.'));
    return undefined;
  }

  const picks: BeadQuickPick[] = items
    .filter((i) => i.id !== excludeId)
    .map((i) => {
      const detail = i.status ? t('Status: {0}', i.status) : undefined;
      return {
        label: i.id,
        description: i.title,
        ...(detail ? { detail } : {}),
        bead: i,
      };
    });

  const selection = await vscode.window.showQuickPick<BeadQuickPick>(picks, { placeHolder });
  return selection?.bead;
}

/**
 * Add a dependency between two beads.
 *
 * If sourceItem is provided, it's used as the dependency source.
 * If edge is provided with sourceId/targetId, those are used directly.
 * Otherwise, shows quick picks for user selection.
 */
export async function addDependencyCommand(
  provider: DependencyEditProvider,
  sourceItem?: BeadItemData,
  edge?: { sourceId?: string; targetId?: string }
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const dependencyEditingEnabled = config.get<boolean>('enableDependencyEditing', false);
  if (!dependencyEditingEnabled) {
    void vscode.window.showWarningMessage(t('Enable dependency editing in settings to add dependencies.'));
    return;
  }

  const items = provider.items;
  const safeEdgeSource = edge?.sourceId ? sanitizeDependencyId(edge.sourceId) : undefined;
  const safeEdgeTarget = edge?.targetId ? sanitizeDependencyId(edge.targetId) : undefined;

  if ((edge?.sourceId && !safeEdgeSource) || (edge?.targetId && !safeEdgeTarget)) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const source =
    sourceItem ??
    (safeEdgeSource ? items?.find((i) => i.id === safeEdgeSource) : undefined) ??
    (await pickBeadQuick(items, t('Select the issue that depends on another item')));

  if (!source) {
    return;
  }

  const target = safeEdgeTarget
    ? items?.find((i) => i.id === safeEdgeTarget)
    : await pickBeadQuick(items, t('Select the issue {0} depends on', source.id), source.id);

  if (!target) {
    return;
  }

  const safeSourceId = sanitizeDependencyId(source.id);
  const safeTargetId = sanitizeDependencyId(target.id);
  if (!safeSourceId || !safeTargetId) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const validationError = validateDependencyAdd(items ?? [], safeSourceId, safeTargetId);
  if (validationError) {
    void vscode.window.showWarningMessage(t(validationError));
    return;
  }

  await provider.addDependency(source, safeTargetId);
}

/**
 * Remove a dependency between two beads.
 *
 * If edge is provided, removes that specific dependency.
 * Otherwise, shows a quick pick of existing dependencies to remove.
 */
export async function removeDependencyCommand(
  provider: DependencyEditProvider,
  edge?: GraphEdgeData,
  options?: { contextId?: string }
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const dependencyEditingEnabled = config.get<boolean>('enableDependencyEditing', false);
  if (!dependencyEditingEnabled) {
    void vscode.window.showWarningMessage(t('Enable dependency editing in settings to remove dependencies.'));
    return;
  }

  const items = provider.items;
  const safeContextId = options?.contextId ? sanitizeDependencyId(options.contextId) : undefined;
  if (options?.contextId && !safeContextId) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const edges = collectDependencyEdges(items ?? []);
  const scopedEdges = safeContextId
    ? edges.filter((e) => e.sourceId === safeContextId || e.targetId === safeContextId)
    : edges;

  let selectedEdge = edge;
  if (selectedEdge) {
    const safeProvidedSource = sanitizeDependencyId(selectedEdge.sourceId);
    const safeProvidedTarget = sanitizeDependencyId(selectedEdge.targetId);
    if (!safeProvidedSource || !safeProvidedTarget) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }
    selectedEdge = { ...selectedEdge, sourceId: safeProvidedSource, targetId: safeProvidedTarget };
  }

  if (!selectedEdge) {
    if (scopedEdges.length === 0) {
      void vscode.window.showWarningMessage(t('No dependencies available to remove.'));
      return;
    }

    const picks: EdgeQuickPick[] = scopedEdges.map((e) => {
      const detail = [e.sourceTitle, e.targetTitle].filter((v) => v && v.length > 0).join(' → ');
      const pick: EdgeQuickPick = {
        label: `${e.sourceId} → ${e.targetId}`,
        edge: e,
      };

      if (e.type) {
        pick.description = e.type;
      }
      if (detail) {
        pick.detail = detail;
      }

      return pick;
    });

    const selection = await vscode.window.showQuickPick<EdgeQuickPick>(picks, {
      placeHolder: t('Select a dependency to remove'),
    });
    if (!selection) {
      return;
    }
    selectedEdge = selection.edge;
  }

  if (!selectedEdge) {
    return;
  }

  await provider.removeDependency(selectedEdge.sourceId, selectedEdge.targetId);
}

/**
 * Create dependency command definitions with bound dependencies.
 *
 * Note: This creates basic add/remove commands. The dependency tree view
 * commands (pickRoot, addUpstream, addDownstream, remove) and
 * visualizeDependencies remain in extension.main due to their complex
 * integration with the dependency tree provider and webview panels.
 */
export function createDependencyCommands(
  provider: DependencyEditProvider
): CommandDefinition[] {
  return [
    {
      id: 'beady.addDependency',
      handler: (...args: unknown[]) =>
        addDependencyCommand(provider, args[0] as BeadItemData | undefined),
      description: 'Add a dependency between beads',
    },
    {
      id: 'beady.removeDependency',
      handler: (...args: unknown[]) => {
        const contextId = (args[0] as BeadItemData | undefined)?.id;
        return removeDependencyCommand(provider, undefined, contextId ? { contextId } : {});
      },
      description: 'Remove a dependency between beads',
    },
  ];
}
