// TUI shim that re-exports the shared worktree core
export {
  type WorktreeEntry,
  type WorktreeRegistry,
  makeWorktreeId,
  isCanonicalWorktreePath,
  buildRegistryFromGit,
  registryPath,
  writeRegistry,
  readRegistry,
  formatWorktreeLabel,
  filterStaleEntries,
  syncRegistry,
} from '../../src/worktree';
