/* eslint-disable @typescript-eslint/no-var-requires */
import * as vscode from 'vscode';
import type {
  BeadsTreeDataProvider as BeadsTreeDataProviderType,
  BeadTreeItem as BeadTreeItemType,
  EpicTreeItem as EpicTreeItemType,
  UngroupedSectionItem as UngroupedSectionItemType,
} from './extension.main';

// Always load a fresh copy so unit tests that stub vscode/child_process get new bindings.
delete require.cache[require.resolve('./extension.main')];
const main = require('./extension.main') as typeof import('./extension.main');

export function activate(context: vscode.ExtensionContext): Promise<void> | void {
  return main.activate(context);
}

export function deactivate(): void {
  return main.deactivate();
}

// Re-export types for downstream imports
export type BeadsTreeDataProvider = BeadsTreeDataProviderType;
export type BeadTreeItem = BeadTreeItemType;
export type EpicTreeItem = EpicTreeItemType;
export type UngroupedSectionItem = UngroupedSectionItemType;

const {
  BeadsTreeDataProvider,
  BeadTreeItem,
  EpicTreeItem,
  UngroupedSectionItem,
  openBeadFromFeed,
  toggleFavorites,
  runBdCommand,
  findBdCommand,
  collectDependencyEdges,
  addDependencyCommand,
  inlineStatusQuickChange,
  inlineEditTitle,
  inlineEditLabels,
  bulkUpdateStatus,
  bulkUpdateLabel,
} = main;

export {
  BeadsTreeDataProvider,
  BeadTreeItem,
  EpicTreeItem,
  UngroupedSectionItem,
  openBeadFromFeed,
  toggleFavorites,
  runBdCommand,
  findBdCommand,
  collectDependencyEdges,
  addDependencyCommand,
  inlineStatusQuickChange,
  inlineEditTitle,
  inlineEditLabels,
  bulkUpdateStatus,
  bulkUpdateLabel,
};
