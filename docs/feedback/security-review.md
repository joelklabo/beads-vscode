# Feedback Flow Security Review (2025-12-04)

## Scope
- VS Code extension feedback flow: user-written text plus optional log attachment built via `buildFeedbackBody`/`captureLogs`.
- Runs locally; no tokens stored on disk; no backend state. Future transport must preserve the controls below.

## Assets & Data Flows
- User input: free-form feedback text.
- Optional telemetry: recent extension logs (tail, sanitized, size-capped).
- Secrets at risk: workspace paths, GitHub/Slack tokens, emails that may appear in logs.
- Sinks: issue/feedback payload constructed in-memory; nothing persisted locally beyond existing logs.

## Trust Boundaries
- Local filesystem (read-only for logs); no writes introduced.
- Outbound network/API (future submission target) must enforce HTTPS and repo/project permissions.

## Controls & Decisions
- Consent: log sharing is **opt-in**; privacy notice states logs are off by default (see `FEEDBACK_PRIVACY_NOTICE`).
- Redaction: `redactLogContent` strips tokens (PATs, Slack, JWTs, bearer), emails, and absolute paths (workspace-specific + generic). Paths are replaced with `<workspace>`/`<path>` markers.
- Size limits: logs tailed to a line cap (`DEFAULT_LOG_LINE_LIMIT`) then clipped to 64KB (`DEFAULT_LOG_BYTES_LIMIT`) with truncation marker.
- Error hygiene: `formatFeedbackError` sanitizes messages and normalizes 401/403/429 responses to user-safe copy (no token/path leakage).
- Storage: No secrets written to disk or console; all processing in-memory.
- Rate limits/permissions: Friendly errors instruct retry/wait or permission checks; no automatic retries that could amplify 429s.

## Checklist
- [x] Token storage minimized / none persisted; only read existing logs.
- [x] Scope minimization: no OAuth scopes requested in extension; any future token use should request repo-limited scopes only.
- [x] Redaction coverage: tokens, emails, absolute paths (POSIX/Windows) plus workspace-specific replacements.
- [x] Consent copy: logs off by default; notice explains sanitization + cap.
- [x] Error messaging: sanitized + friendly via `formatFeedbackError`.
- [x] Rate limits: 429 guidance; no unbounded retries.

## Findings
- High/Critical: none.
- Medium: none.
- Low (future guardrails): when adding a transport layer, ensure it (a) uses `formatFeedbackError` for UI surfacing, (b) preserves opt-in default for attachments, (c) sends over HTTPS with repo-scoped token, (d) adds an integration test that validates redaction before network send.

## Follow-ups
- Open a task when network submission is implemented to add an end-to-end test that asserts redaction + size limits before send.
