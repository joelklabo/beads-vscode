# Epic: Little Glen webview security hardening (beads-vscode-vc9z)

## Objective
Lock down Little Glen webviews/hovers against XSS and unsafe command execution using strict CSP, markdown sanitization, and input validation.

## Target surfaces
- Webview panel(s) for Little Glen (HTML, scripts, styles)
- Hovers/tooltips that render markdown/HTML
- Commands invoked from panel/hover actions

## Success criteria
- Strict CSP: no inline scripts/styles; only VS Code provided resources (vscode-resource/vscode-webview URIs).
- Sanitization: all markdown/html rendered through a sanitizer (e.g., DOMPurify-like) with allowed tags/attrs list; remote images disabled by default.
- Command validation: IDs and arguments validated/whitelisted before executing VS Code commands.
- Security checklist documented and checked.

## Planned work items (suggested slices)
1) CSP tightening
- Audit webview HTML generation; add meta CSP with `default-src 'none'; img-src data: vscode-resource:; style-src 'self'; script-src 'self';` and use nonce or external script file.
- Remove inline event handlers/styles.

2) Sanitization layer
- Route all markdown/HTML through a sanitizer; disable script/iframe/object, restrict links, optionally add link target rel="noopener".
- Add unit/integration tests with malicious payload fixtures.

3) Command/input validation
- Add validation helpers for panel message handlers and command invocations (ids, payload shape, type guards).
- Reject/escape untrusted inputs; log and surface errors safely.

4) Checklist & docs
- Add `docs/security/little-glen.md` describing CSP, sanitization rules, and test commands.
- Update tests to cover CSP present and sanitizer behavior.

## Risks / notes
- Need to confirm current Little Glen entry points/files to avoid missing surfaces.
- CSP may require adjusting resource loading paths (fonts/css/js) to match VS Code webview scheme.
- Tests may need headless VS Code run to verify CSP headers in webview HTML.
