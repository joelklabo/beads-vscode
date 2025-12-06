#!/bin/bash
# task-branch.sh - Helper script for agent task workflow
# Usage: ./scripts/task-branch.sh <command> <worker-name> [task-id]
#
# Commands:
#   start <worker> <task-id>  - Create branch and start task
#   finish <worker> <task-id> - Merge branch back to main
#   status                    - Show current branch and git status
#   cleanup <worker>          - Delete all branches for a worker

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

COMMAND="${1:-}"
WORKER="${2:-}"
TASK_ID="${3:-}"

case "$COMMAND" in
  start)
    if [[ -z "$WORKER" || -z "$TASK_ID" ]]; then
      echo "Usage: $0 start <worker-name> <task-id>"
      echo "Example: $0 start agent-1 beady-abc"
      exit 1
    fi

    BRANCH="${WORKER}/${TASK_ID}"
    
    log_info "Starting task $TASK_ID for worker $WORKER"
    
    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
      log_error "You have uncommitted changes. Commit or stash them first."
      git status --short
      exit 1
    fi
    
    # Ensure we're up to date with main
    log_info "Fetching latest from origin..."
    git fetch origin main
    
    # Switch to main
    log_info "Switching to main branch..."
    git checkout main
    git pull origin main
    
    # Check if branch already exists
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
      log_warn "Branch $BRANCH already exists locally. Switching to it."
      git checkout "$BRANCH"
    else
      # Create and switch to new branch
      log_info "Creating branch: $BRANCH"
      git checkout -b "$BRANCH"
    fi
    
    # Update task status in bd
    log_info "Marking task as in_progress..."
    npx bd update "$TASK_ID" --status in_progress --assignee "$WORKER" --actor "$WORKER" || true
    
    log_info "✅ Ready to work on $TASK_ID"
    log_info "Branch: $(git branch --show-current)"
    echo ""
    echo "Next steps:"
    echo "  1. Run: npx bd show $TASK_ID"
    echo "  2. Implement the task"
    echo "  3. Test: npm run compile && npm run lint"
    echo "  4. Commit: git add -A && git commit -m '$TASK_ID: <title>'"
    echo "  5. Finish: ./scripts/task-branch.sh finish $WORKER $TASK_ID"
    ;;

  finish)
    if [[ -z "$WORKER" || -z "$TASK_ID" ]]; then
      echo "Usage: $0 finish <worker-name> <task-id>"
      echo "Example: $0 finish agent-1 beady-abc"
      exit 1
    fi

    BRANCH="${WORKER}/${TASK_ID}"
    CURRENT_BRANCH=$(git branch --show-current)
    
    # Verify we're on the correct branch
    if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
      log_error "You're on branch '$CURRENT_BRANCH', expected '$BRANCH'"
      log_error "Switch to the correct branch first: git checkout $BRANCH"
      exit 1
    fi
    
    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
      log_error "You have uncommitted changes. Commit them first:"
      git status --short
      exit 1
    fi
    
    # Check that we have commits beyond main
    COMMITS_AHEAD=$(git rev-list --count origin/main..HEAD)
    if [[ "$COMMITS_AHEAD" -eq 0 ]]; then
      log_error "No commits on this branch. Did you forget to commit?"
      exit 1
    fi
    log_info "Branch has $COMMITS_AHEAD commit(s) to merge"
    
    # Fetch latest main
    log_info "Fetching latest main..."
    git fetch origin main
    
    # Rebase on main (resolve conflicts on our branch)
    log_info "Rebasing on main..."
    if ! git rebase origin/main; then
      log_error "Rebase failed! Resolve conflicts, then:"
      echo "  1. Fix conflicts in the listed files"
      echo "  2. git add <fixed-files>"
      echo "  3. git rebase --continue"
      echo "  4. Re-run: ./scripts/task-branch.sh finish $WORKER $TASK_ID"
      echo ""
      echo "Or abort and start over:"
      echo "  git rebase --abort"
      exit 1
    fi
    
    # Switch to main
    log_info "Switching to main..."
    git checkout main
    git pull origin main
    
    # Merge with retry logic
    MAX_RETRIES=3
    RETRY=0
    while [[ $RETRY -lt $MAX_RETRIES ]]; do
      log_info "Merging $BRANCH into main (attempt $((RETRY+1))/$MAX_RETRIES)..."
      
      if git merge "$BRANCH" --no-ff -m "Merge $TASK_ID

Worked-by: $WORKER
Branch: $BRANCH"; then
        # Try to push
        if git push origin main; then
          log_info "✅ Successfully merged and pushed!"
          break
        else
          log_warn "Push failed, pulling and retrying..."
          git reset --hard HEAD~1  # Undo merge
          git pull --rebase origin main
          RETRY=$((RETRY+1))
        fi
      else
        log_error "Merge failed! This shouldn't happen after rebase."
        git merge --abort || true
        exit 1
      fi
    done
    
    if [[ $RETRY -eq $MAX_RETRIES ]]; then
      log_error "Failed to push after $MAX_RETRIES attempts. Manual intervention needed."
      exit 1
    fi
    
    # Clean up branch
    log_info "Cleaning up branch..."
    git branch -d "$BRANCH"
    
    # Close the task
    log_info "Closing task..."
    npx bd close "$TASK_ID" --reason "Implemented and merged" --actor "$WORKER" || true
    
    log_info "✅ Task $TASK_ID complete!"
    echo ""
    echo "Next: ./scripts/task-branch.sh start $WORKER <next-task-id>"
    ;;

  status)
    echo "Current branch: $(git branch --show-current)"
    echo ""
    echo "Local branches:"
    git branch
    echo ""
    echo "Git status:"
    git status --short
    echo ""
    echo "In-progress tasks:"
    npx bd list --status in_progress 2>/dev/null || echo "(none)"
    ;;

  cleanup)
    if [[ -z "$WORKER" ]]; then
      echo "Usage: $0 cleanup <worker-name>"
      exit 1
    fi
    
    log_warn "This will delete all local branches starting with '$WORKER/'"
    echo "Branches to delete:"
    git branch | grep "  $WORKER/" || echo "(none found)"
    echo ""
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git branch | grep "  $WORKER/" | xargs -r git branch -D
      log_info "Cleanup complete"
    else
      log_info "Cancelled"
    fi
    ;;

  *)
    echo "task-branch.sh - Helper script for agent task workflow"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  start <worker> <task-id>   Create branch and start working on task"
    echo "  finish <worker> <task-id>  Merge branch back to main and close task"
    echo "  status                     Show current branch and git status"
    echo "  cleanup <worker>           Delete all local branches for a worker"
    echo ""
    echo "Examples:"
    echo "  $0 start agent-1 beady-abc"
    echo "  $0 finish agent-1 beady-abc"
    echo "  $0 status"
    echo "  $0 cleanup agent-1"
    ;;
esac
