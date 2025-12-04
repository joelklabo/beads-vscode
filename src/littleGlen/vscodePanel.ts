import { escapeHtml, sanitizeMarkdown, MarkdownSanitizeOptions } from '../utils';

export interface PanelRenderOptions extends MarkdownSanitizeOptions {
  /** Optional heading to render above the sanitized body. */
  title?: string;
  /**
   * CSP meta value to embed in the generated HTML.
   * Defaults to a locked-down policy matching the Little Glen CSP draft.
   */
  contentSecurityPolicy?: string;
}

const DEFAULT_PANEL_CSP =
  "default-src 'none'; img-src vscode-webview-resource: data:; style-src 'self'; script-src 'self';";

/**
 * Render sanitized HTML for the Little Glen webview panel.
 * The returned string is safe to pass directly to `webview.html`.
 */
export function renderPanelHtml(body: string, options: PanelRenderOptions = {}): string {
  const safeBody = sanitizeMarkdown(body, { allowRemoteImages: options.allowRemoteImages });
  const heading = escapeHtml(options.title ?? 'Little Glen');
  const csp = options.contentSecurityPolicy ?? DEFAULT_PANEL_CSP;

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '</head>',
    '<body>',
    `<h1>${heading}</h1>`,
    `<div class="lg-content">${safeBody}</div>`,
    '</body>',
    '</html>'
  ].join('');
}
