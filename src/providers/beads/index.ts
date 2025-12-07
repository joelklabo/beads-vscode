/**
 * Beads provider exports.
 * Re-exports lifecycle management, store utilities, and item definitions.
 */

// Lifecycle management
export { BeadsLifecycle, BeadsRefreshEvent, BeadsErrorEvent } from './lifecycle';

// Store utilities (re-exports from @beads/core)
export {
  BeadsDocument,
  BeadsStore,
  BeadsStoreSnapshot,
  WorkspaceTarget,
  WatcherManager,
  createBeadsStore,
  createWorkspaceTarget,
  createVsCodeWatchAdapter,
  findBdCommand,
  naturalSort,
  saveBeadsDocument,
  WorkspaceTargetInput,
} from './store';

// Item types and utilities
export {
  BeadTreeItem,
  BeadDetailItem,
  SummaryHeaderItem,
  StatusSectionItem,
  AssigneeSectionItem,
  EpicTreeItem,
  UngroupedSectionItem,
  WarningSectionItem,
  EpicStatusSectionItem,
  getAssigneeInfo,
} from './items';
