import { escapeHtml, sanitizeMarkdown, MarkdownSanitizeOptions } from '../utils';
import { validateLittleGlenMessage, AllowedLittleGlenCommand } from './validation';

export type PanelMessageHandler = {
  openBead?: (beadId: string) => Promise<void> | void;
  openExternalUrl?: (url: string) => Promise<void> | void;
  updateStatus?: (status: string) => Promise<void> | void;
  updateTitle?: (title: string) => Promise<void> | void;
  addLabel?: (label: string) => Promise<void> | void;
  removeLabel?: (label: string) => Promise<void> | void;
};

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

/**
 * Validate and route messages coming from the Little Glen panel webview.
 * Call this inside `webview.onDidReceiveMessage`.
 */
export async function handlePanelMessage(
  message: unknown,
  handlers: PanelMessageHandler
): Promise<void> {
  const allowed: AllowedLittleGlenCommand[] = [
    'openBead',
    'openExternalUrl',
    'updateStatus',
    'updateTitle',
    'addLabel',
    'removeLabel'
  ];

  const validated = validateLittleGlenMessage(message, allowed);
  if (!validated) {
    console.warn('[Little Glen] Ignoring invalid panel message');
    return;
  }

  switch (validated.command) {
    case 'openBead':
      if (handlers.openBead) {
        await handlers.openBead(validated.beadId);
      }
      break;
    case 'openExternalUrl':
      if (handlers.openExternalUrl) {
        await handlers.openExternalUrl(validated.url);
      }
      break;
    case 'updateStatus':
      if (handlers.updateStatus) {
        await handlers.updateStatus(validated.status);
      }
      break;
    case 'updateTitle':
      if (handlers.updateTitle) {
        await handlers.updateTitle(validated.title);
      }
      break;
    case 'addLabel':
      if (handlers.addLabel) {
        await handlers.addLabel(validated.label);
      }
      break;
    case 'removeLabel':
      if (handlers.removeLabel) {
        await handlers.removeLabel(validated.label);
      }
      break;
  }
}
