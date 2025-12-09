/**
 * Command module exports.
 *
 * This barrel file exports all command-related types, interfaces, and factory
 * functions for registering commands with VS Code.
 *
 * Usage pattern:
 * ```ts
 * import { CommandRegistry, createCoreBeadsCommands, createExportCommands } from './commands';
 *
 * const registry = new CommandRegistry();
 * registry.registerAll(createCoreBeadsCommands(provider, runCommand));
 * registry.registerAll(createExportCommands(provider, treeView));
 * // ... register other command modules
 * context.subscriptions.push(...registry.getDisposables());
 * ```
 */

// Core registry and types
export { CommandRegistry, CommandDefinition, CommandHandler, defineCommand } from './registry';

// Command factory modules
export { createCoreBeadsCommands, createBead, CoreBeadsProvider, RunBdCommandFn } from './beads';
export { createDependencyCommands, addDependencyCommand, removeDependencyCommand, DependencyEditProvider } from './dependencies';
export { createExportCommands, exportBeadsCsv, exportBeadsMarkdown, BeadsProvider, BeadTreeItemLike } from './exports';
export { createBulkCommands, bulkUpdateStatus, bulkUpdateLabel, RefreshableProvider } from './bulk';
export { createFavoritesCommands, toggleFavorites } from './favorites';
export { createQuickFilterCommands, QuickFilterProvider } from './quickFilters';
export {
  createInlineEditCommands,
  inlineEditTitle,
  inlineEditLabels,
  inlineStatusQuickChange,
  editAssignee,
  LabelEditableProvider,
} from './inlineEdits';

// Re-export the sendFeedback command (legacy module)
export { sendFeedback } from './sendFeedback';

// Additional command handlers
export { selectWorkspace } from './handlers';
