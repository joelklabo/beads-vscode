import { sanitizeMarkdown, MarkdownSanitizeOptions } from '../utils';

export interface HoverRenderOptions extends MarkdownSanitizeOptions {
  /**
   * Whether to mark the resulting hover HTML as trusted by the caller.
   * This module only returns a sanitized string; callers can decide how to wrap it.
   */
  isTrusted?: boolean;
}

/**
 * Sanitize Little Glen hover markdown before it is wrapped in a MarkdownString.
 * Consumers should set `supportHtml = true` on the MarkdownString they create.
 */
export function renderHoverHtml(markdown: string, options: HoverRenderOptions = {}): string {
  return sanitizeMarkdown(markdown, { allowRemoteImages: options.allowRemoteImages });
}
