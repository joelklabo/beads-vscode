import * as vscode from 'vscode';
import * as path from 'path';
import {
  BeadItemData,
  formatError,
  writeBeadsCsvFile,
  CsvExportHeaders,
  writeBeadsMarkdownFile,
  MarkdownExportHeaders,
} from '../utils';
import { CommandDefinition } from './registry';

const t = vscode.l10n.t;

/**
 * Interface for components that can provide visible beads.
 */
export interface BeadsProvider {
  getVisibleBeads(): BeadItemData[];
}

/**
 * Interface for tree items that represent beads.
 */
export interface BeadTreeItemLike {
  bead: BeadItemData;
}

/**
 * Check if an item is a bead tree item.
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
 * Export beads to CSV file.
 */
export async function exportBeadsCsv(
  provider: BeadsProvider,
  treeView: vscode.TreeView<unknown> | undefined
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('exportCsv.enabled', false);

  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.exportCsv.enabled" setting to export beads to CSV.')
    );
    return;
  }

  const selectedBeads = treeView?.selection
    ?.filter(isBeadTreeItem)
    .map((item) => item.bead) ?? [];

  const beadsToExport = selectedBeads.length > 0 ? selectedBeads : provider.getVisibleBeads();

  if (!beadsToExport || beadsToExport.length === 0) {
    void vscode.window.showInformationMessage(
      t('No beads to export. Adjust your selection or filters and try again.')
    );
    return;
  }

  const defaultWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const defaultUri = defaultWorkspace
    ? vscode.Uri.file(path.join(defaultWorkspace, 'beads-export.csv'))
    : undefined;

  const saveDialogOptions: vscode.SaveDialogOptions = {
    filters: { CSV: ['csv'], 'All Files': ['*'] },
    saveLabel: t('Export'),
  };
  if (defaultUri) {
    saveDialogOptions.defaultUri = defaultUri;
  }

  const saveUri = await vscode.window.showSaveDialog(saveDialogOptions);

  if (!saveUri) {
    return;
  }

  const headers: CsvExportHeaders = {
    id: t('ID'),
    title: t('Title'),
    status: t('Status'),
    type: t('Type'),
    labels: t('Labels'),
    updated: t('Updated'),
  };

  try {
    await writeBeadsCsvFile(beadsToExport, headers, saveUri.fsPath, {
      delimiter: config.get<string>('exportCsv.delimiter', ','),
      includeBom: config.get<boolean>('exportCsv.includeBom', false),
    });
    void vscode.window.showInformationMessage(
      t('Exported {0} bead(s) to {1}', beadsToExport.length, path.basename(saveUri.fsPath))
    );
  } catch (error) {
    console.error('Failed to export beads', error);
    void vscode.window.showErrorMessage(formatError(t('Failed to export beads'), error));
  }
}

/**
 * Export beads to Markdown file.
 */
export async function exportBeadsMarkdown(
  provider: BeadsProvider,
  treeView: vscode.TreeView<unknown> | undefined
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('exportMarkdown.enabled', false);

  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.exportMarkdown.enabled" setting to export beads to Markdown.')
    );
    return;
  }

  const selectedBeads = treeView?.selection
    ?.filter(isBeadTreeItem)
    .map((item) => item.bead) ?? [];

  const beadsToExport = selectedBeads.length > 0 ? selectedBeads : provider.getVisibleBeads();

  if (!beadsToExport || beadsToExport.length === 0) {
    void vscode.window.showInformationMessage(
      t('No beads to export. Adjust your selection or filters and try again.')
    );
    return;
  }

  const defaultWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const defaultUri = defaultWorkspace
    ? vscode.Uri.file(path.join(defaultWorkspace, 'beads-export.md'))
    : undefined;

  const markdownDialogOptions: vscode.SaveDialogOptions = {
    filters: { Markdown: ['md'], 'All Files': ['*'] },
    saveLabel: t('Export'),
  };
  if (defaultUri) {
    markdownDialogOptions.defaultUri = defaultUri;
  }

  const saveUri = await vscode.window.showSaveDialog(markdownDialogOptions);

  if (!saveUri) {
    return;
  }

  const headers: MarkdownExportHeaders = {
    id: t('ID'),
    title: t('Title'),
    status: t('Status'),
    type: t('Type'),
    labels: t('Labels'),
    updated: t('Updated'),
  };

  try {
    await writeBeadsMarkdownFile(beadsToExport, headers, saveUri.fsPath);
    void vscode.window.showInformationMessage(
      t('Exported {0} bead(s) to {1}', beadsToExport.length, path.basename(saveUri.fsPath))
    );
  } catch (error) {
    console.error('Failed to export beads', error);
    void vscode.window.showErrorMessage(formatError(t('Failed to export beads'), error));
  }
}

/**
 * Create export command definitions with bound dependencies.
 */
export function createExportCommands(
  provider: BeadsProvider,
  treeView: vscode.TreeView<unknown> | undefined
): CommandDefinition[] {
  return [
    {
      id: 'beady.exportCsv',
      handler: () => exportBeadsCsv(provider, treeView),
      description: 'Export beads to CSV',
    },
    {
      id: 'beady.exportMarkdown',
      handler: () => exportBeadsMarkdown(provider, treeView),
      description: 'Export beads to Markdown',
    },
  ];
}
