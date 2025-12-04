# Little Glen Security Notes (rev15)

Date: 2025-12-04
Scope: Little Glen bead detail panel, dependency visualizer, activity feed webview, and hover markdown surfaces.

## Threats
- XSS via bead data (titles, labels, notes, dependency names) rendered inside webviews.
- Script execution through inline handlers, `javascript:` URLs, or `<script>` injection into serialized JSON blobs.
- Webviews loading unexpected local resources or exfiltrating data via loose `localResourceRoots`.
- Crafted webview messages invoking arbitrary extension commands (open/refresh/visualize).

## Mitigations (rev15)
- **Strict CSP**: each Little Glen webview emits `default-src 'none'`; `script-src 'nonce-…'`; `style-src 'nonce-…' 'unsafe-inline' ${webview.cspSource}; img/font-src ${webview.cspSource} https: data:; connect/frame/object/base-uri/form-action none`.
- **Nonces everywhere**: all `<script>`/`<style>` tags carry a fresh nonce; inline event handlers removed.
- **Resource narrowing**: `localResourceRoots: []` on Little Glen panels to block filesystem/webview resource access.
- **Sanitization**: markdown/HTML routed through `sanitizeMarkdown`; bead fields/labels/titles escaped; dependency node titles escaped; edge types/status values clamped; external references limited to http/https and escaped.
- **Safe serialization**: data injected into scripts uses `serializeForScript` to neutralize `</script>` and special characters.
- **Command allowlist**: webview message handlers validated via `validateLittleGlenMessage`; only allowed commands (open/update/title/status/label, openExternalUrl) execute; URLs/IDs/labels length-checked. Debug logging trimmed to avoid raw payloads/paths.

## Testing
- `npm run compile` / `npm run lint` to ensure TypeScript + lint safety.
- `src/test/sanitization.test.ts` updated to assert CSP is emitted and sanitizer removes scripts.
- Manual: load bead detail/visualizer/activity feed with malicious titles/links to confirm CSP blocks script execution and navigation is validated.
