# Tooltip / Hover Safety Rules

Date: 2025-12-04

## Principles
- Treat all user/project text as untrusted (titles, descriptions, tags, external refs, feed comments).
- Never allow inline HTML or command URIs inside tooltips; keep `MarkdownString.isTrusted = false` and `supportHtml = false`.
- Escape markdown control characters before injecting text (see `escapeMarkdownText`).
- Assignee-facing UI (tree descriptions, tooltips, pickers, grouping labels/collapse keys) must pass names through `sanitizeInlineText` (and `sanitizeTooltipText` for markdown) before rendering or storing.

## Implementation notes
- Tree items (`BeadTreeItem`) and activity feed items use escaped markdown and disabled trust; summaries are plain text only.
- Preview snippets are truncated/normalized before insertion; no raw `javascript:` links or `<script>` blocks are allowed.
- Sanitizer coverage is enforced by `tooltips.security.test.ts` for both tree and feed tooltips.
- Assignee display pills in the in-progress panel and tree item badges are sanitized and escaped; colors are derived from the sanitized string only.

## Checklist
- [x] Tooltips avoid `isTrusted` on untrusted content
- [x] Markdown text escaped via `escapeMarkdownText`
- [x] Malicious HTML/JS blocked in tree and feed tooltips
- [x] Tests guard against regressions
