# Agent Harness (draft)

Goal: simulate multiple agents using `task-worktree.sh` + `bd` against a temporary repo and .beads store to prove deadlock-free behavior.

## Proposed shape
- Temporary git repo + .beads directory per run (no interaction with real repo)
- N agents (default 5) running randomized sequences: ready -> claim-next -> (optional) create/close -> finish
- Deterministic seed input for reproducibility
- JSON trace per run capturing steps and durations

## Current status
- Skeleton only; implement in follow-up steps.

## TODO
- Node runner that spins up temp repo, seeds a few open tasks, then launches agent child processes
- Assertions: all agents exit 0, no stuck locks, no orphaned worktrees in temp area
