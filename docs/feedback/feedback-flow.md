# Feedback flow settings

These settings shape how feedback is collected and sent. The feature is **opt-in by default** so teams can stage configuration before turning it on.

## Settings and defaults

- `beads.feedback.enabled` (default: `false`)
  - Master flag that hides feedback commands/UI when off or misconfigured.
- `beads.feedback.repository` (default: empty)
  - Target GitHub repository in `owner/repo` form. Invalid values are rejected by the settings UI.
- `beads.feedback.labels` (object)
  - Maps feedback types to labels. Default mapping:

    | Type      | Default label |
    |-----------|---------------|
    | `bug`     | `bug`         |
    | `feature` | `enhancement` |
    | `question`| `question`    |
    | `other`   | `feedback`    |

  - Additional keys may be added; empty strings skip labeling for that type.
- `beads.feedback.useGitHubCli` (default: `false`)
  - Prefer the `gh` CLI for submissions when available; falls back to direct API.
- `beads.feedback.includeAnonymizedLogs` (default: `true`)
  - Allow attaching sanitized logs/metadata. Users are prompted before anything is sent.

## Validation

- `beads.feedback.repository` must match `owner/repo` (`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`).
- The feature flag is treated as disabled if the repository setting is missing or invalid.

## Operational notes

- Keep feedback enabled only after confirming repository, label mapping, and auth are in place.
- The feature flag is meant to disable all feedback surfaces and commands for safe rollout.
