# Dependency editing rollout

- **Flag**: `beads.enableDependencyEditing` (default: `false`). Keep off until CLI support is verified in your environment.
- **CLI requirement**: `bd >= 0.29.0` for dependency add/remove commands. Older versions will trigger a warning and should not surface the UI.
- **How to enable**: Set the flag to `true` in VS Code settings once the workspace uses a compatible `bd` binary. The extension runs a lightweight `bd --version` check and warns when the version is too low or missing.
- **Rollback**: Set `beads.enableDependencyEditing` back to `false` and reload the window; no migrations needed.
- **Scope**: Only affects dependency editing UI/commands; other features remain unchanged.
- **Monitoring**: Watch the VS Code Notifications area for warnings labeled "dependency editing" after enabling the flag.
