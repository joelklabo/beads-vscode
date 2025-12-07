/**
 * Graph webview module.
 *
 * This module provides the dependency graph visualization webview.
 * It encapsulates the webview panel creation, HTML generation, and
 * message handling for the dependency visualization.
 */

import * as vscode from 'vscode';
import type { BeadItemData } from '../utils';
import type { DependencyTreeStrings, GraphNodeData, GraphEdgeData } from '../utils/graph';
import { mapBeadsToGraphNodes, collectDependencyEdges } from '../utils/graph';
import { buildDependencyGraphHtml } from '../graph/view';
import { validateLittleGlenMessage, AllowedLittleGlenCommand } from '../littleGlen/validation';

const t = vscode.l10n.t;

/**
 * Status label mapping for localized status strings.
 */
export interface StatusLabelMap {
  open: string;
  in_progress: string;
  closed: string;
  blocked: string;
}

/**
 * Dependencies required for graph webview operations.
 */
export interface GraphViewDependencies {
  /**
   * Get the current list of bead items.
   */
  getItems: () => BeadItemData[];

  /**
   * Open a bead by its data object.
   */
  openBead: (bead: BeadItemData) => Promise<void>;

  /**
   * Add a dependency between two beads.
   * @param sourceId The source (dependent) bead ID
   * @param targetId The target (dependency) bead ID
   */
  addDependency: (sourceId: string, targetId: string) => Promise<void>;

  /**
   * Remove a dependency, optionally with context for picking from multiple.
   * @param sourceId The source bead ID (optional if contextId provided)
   * @param targetId The target bead ID (optional if contextId provided)
   * @param contextId Context bead ID for picking dependency to remove
   */
  removeDependency: (sourceId?: string, targetId?: string, contextId?: string) => Promise<void>;
}

/**
 * Result of graph webview creation.
 */
export interface GraphViewResult {
  /** The webview panel */
  panel: vscode.WebviewPanel;
}

/**
 * Build localized strings for the dependency tree visualization.
 */
export function buildDependencyTreeStrings(statusLabels: StatusLabelMap): DependencyTreeStrings {
  return {
    title: t('Beads Dependency Tree'),
    resetView: t('Reset View'),
    autoLayout: t('Auto Layout'),
    removeDependencyLabel: t('Remove Dependency'),
    legendClosed: statusLabels.closed,
    legendInProgress: statusLabels.in_progress,
    legendOpen: statusLabels.open,
    legendBlocked: statusLabels.blocked,
    emptyTitle: t('No beads found'),
    emptyDescription: t('The visualizer received 0 nodes. Check the Output panel for debug logs.'),
    renderErrorTitle: t('Render Error'),
  };
}

/**
 * Get localized status labels for the UI.
 */
export function getStatusLabels(): StatusLabelMap {
  return {
    open: t('Open'),
    in_progress: t('In Progress'),
    closed: t('Closed'),
    blocked: t('Blocked'),
  };
}

/**
 * Render the dependency graph HTML with current state.
 */
function renderGraphHtml(
  items: BeadItemData[],
  dependencyStrings: DependencyTreeStrings,
  locale: string,
  dependencyEditingEnabled: boolean
): string {
  const nodes: GraphNodeData[] = mapBeadsToGraphNodes(items);
  const edges: GraphEdgeData[] = collectDependencyEdges(items);
  return buildDependencyGraphHtml(nodes, edges, dependencyStrings, locale, dependencyEditingEnabled);
}

/**
 * Create and show the dependency graph webview.
 *
 * This function creates a webview panel that displays the dependency graph
 * visualization. It handles message passing between the webview and the
 * extension for opening beads and editing dependencies.
 *
 * @param deps Dependencies for graph operations
 * @returns GraphViewResult with the panel reference
 */
export function createDependencyGraphView(deps: GraphViewDependencies): GraphViewResult {
  const statusLabels = getStatusLabels();
  const dependencyStrings = buildDependencyTreeStrings(statusLabels);
  const locale = vscode.env.language || 'en';
  const dependencyEditingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);

  const panel = vscode.window.createWebviewPanel(
    'beadDependencyTree',
    dependencyStrings.title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Initial render
  const items = deps.getItems();
  panel.webview.html = renderGraphHtml(items, dependencyStrings, locale, dependencyEditingEnabled);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    const allowed: AllowedLittleGlenCommand[] = ['openBead', 'addDependency', 'removeDependency'];
    const validated = validateLittleGlenMessage(message, allowed);
    
    if (!validated) {
      console.warn('[Little Glen] Ignoring invalid visualizeDependencies message');
      return;
    }

    if (validated.command === 'openBead') {
      const currentItems = deps.getItems();
      const item = currentItems.find((i) => i.id === validated.beadId);
      if (item) {
        await deps.openBead(item);
      } else {
        void vscode.window.showWarningMessage(t('Issue {0} not found', validated.beadId));
      }
    } else if (validated.command === 'addDependency') {
      if (validated.sourceId && validated.targetId) {
        await deps.addDependency(validated.sourceId, validated.targetId);
        // Refresh the graph after dependency change
        const refreshed = deps.getItems();
        panel.webview.html = renderGraphHtml(refreshed, dependencyStrings, locale, dependencyEditingEnabled);
      }
    } else if (validated.command === 'removeDependency') {
      await deps.removeDependency(validated.sourceId, validated.targetId, validated.contextId);
      // Refresh the graph after dependency change
      const refreshed = deps.getItems();
      panel.webview.html = renderGraphHtml(refreshed, dependencyStrings, locale, dependencyEditingEnabled);
    }
  });

  return { panel };
}

/**
 * Refresh an existing graph webview panel with updated data.
 *
 * @param panel The webview panel to refresh
 * @param items Current list of bead items
 */
export function refreshDependencyGraphView(
  panel: vscode.WebviewPanel,
  items: BeadItemData[]
): void {
  const statusLabels = getStatusLabels();
  const dependencyStrings = buildDependencyTreeStrings(statusLabels);
  const locale = vscode.env.language || 'en';
  const dependencyEditingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);

  panel.webview.html = renderGraphHtml(items, dependencyStrings, locale, dependencyEditingEnabled);
}
