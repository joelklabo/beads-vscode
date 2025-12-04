# Little Glen CSP Policy (draft)

Goal: lock down Little Glen webviews/hovers to prevent XSS and limit resource loading.

## Webview CSP (proposed)
```
Content-Security-Policy: default-src 'none';
  img-src vscode-webview-resource: data:;
  font-src vscode-webview-resource:;
  style-src 'self' 'nonce-${nonce}';
  script-src 'self' 'nonce-${nonce}';
  connect-src 'self';
  frame-ancestors 'none';
```
Notes:
- Use VS Code webview scheme (`vscode-webview-resource:`) for local assets.
- No remote images/scripts/styles; allow `data:` for inline svg/png icons.
- All scripts/styles loaded via files plus a per-render nonce to enable minimal inline bootstrapping if needed.
- Disallow inline event handlers; keep DOM event listeners in JS modules.

## Hover CSP
- Use VS Code markdown engine with sanitized HTML; avoid raw `<script>`/`style>` entirely.
- If custom HTML is injected, wrap in a `default-src 'none'; img-src data:; style-src 'self';` meta tag.

## Asset loading
- Bundle Little Glen JS/CSS in `media/` and load via `webview.asWebviewUri`.
- Avoid `http(s)` fonts/images; prefer VS Code codicons or inlined SVG.

## Testing
- Verify CSP header/meta present in generated HTML (snapshot test).
- Inject malicious payloads (script/img/srcdoc) in tests to ensure blocked.
