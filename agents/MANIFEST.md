# Agent Manifest

Total Agents: 2
Last Update: 2025-12-07

### task-creator
- **File**: `task-creator.agent.md`
- **Version**: 1.0.0
- **Role**: Turn a feature request into a complete `bd` epic + task tree with dependencies and file coverage.
- **Capabilities**:
  - Research feature requests
  - Decompose work into atomic tasks
  - Create dependency graphs
  - Generate `bd` CLI commands
- **Delegates To**: None
- **When to Use**: When you have a high-level feature request that needs to be broken down into actionable tasks.
- **Invoke With**: `/agent task-creator`

### task-worker
- **File**: `task-worker.agent.md`
- **Version**: 1.0.0
- **Role**: Continuously work through ALL `bd` issues until none remain. Work independently without asking for input.
- **Capabilities**:
  - Claim and execute tasks
  - Manage git worktrees
  - Implement features and fixes
  - Run tests and verification
- **Delegates To**: None
- **When to Use**: When you have a list of ready tasks that need to be implemented.
- **Invoke With**: `/agent task-worker`
