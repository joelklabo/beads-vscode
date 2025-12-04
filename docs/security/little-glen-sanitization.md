# Little Glen Sanitization (draft)

## Library choice
- Use `sanitize-html` (Node) for hover/panel markdown-to-HTML pipeline.
- Allowed tags: a, p, ul, ol, li, b, i, strong, em, code, pre, span, div, br, hr, img.
- Allowed attributes:
  - `a`: href, title, target, rel (force `rel="noopener noreferrer"`, strip javascript:)
  - `img`: src, alt, title (src must be data: or vscode-webview-resource:, no http(s) by default)
  - `*`: class, style (optional; consider dropping style to tighten)
- Disallowed: script, iframe, object, embed, video, audio, svg with script/animation, on* event handlers.

## Markdown pipeline
1) Render markdown using VS Code MarkdownIt with `linkify` on.
2) Run rendered HTML through sanitizer config above.
3) Post-process links: enforce target="_blank" and rel="noopener noreferrer"; optionally block mailto and file schemes.

## Inputs to sanitize
- Task descriptions or data shown in Little Glen panel
- Hover content (markdown)
- Any user-entered strings echoed into panel commands/messages

## Edge cases
- Images: allow data: and vscode-webview-resource: only; drop remote images.
- Links: strip javascript:, data:text/html; whitelist http/https if needed with allowlist.
- Pasted content: sanitizer strips disallowed tags/attrs.

## Tests
- Fixture HTML with script/iframe/javascript: links → sanitizer removes/neutralizes.
- Image src http://example.com blocked; data: allowed; vscode-webview-resource allowed.
- Link rel/target normalized.
