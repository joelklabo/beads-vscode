import sanitizeHtml, { Attributes, IOptions } from 'sanitize-html';

export interface MarkdownSanitizeOptions {
  /** Allow http/https images (blocked by default). */
  allowRemoteImages?: boolean;
}

const LITTLE_GLEN_SANITIZE_BASE: IOptions = {
  allowedTags: [
    'a',
    'p',
    'ul',
    'ol',
    'li',
    'b',
    'i',
    'strong',
    'em',
    'code',
    'pre',
    'span',
    'div',
    'br',
    'hr',
    'img',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote'
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'vscode-resource', 'vscode-webview-resource'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto', 'tel', 'vscode-resource', 'vscode-webview-resource'],
    img: ['data', 'vscode-resource', 'vscode-webview-resource']
  },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true,
  transformTags: {
    a: sanitizeHtml.simpleTransform(
      'a',
      { target: '_blank', rel: 'noopener noreferrer' },
      true
    ),
    img: (tagName: string, attribs: Attributes) => {
      const src = attribs.src ?? '';
      const lowerSrc = src.toLowerCase();
      if (lowerSrc.startsWith('data:') && !lowerSrc.startsWith('data:image/')) {
        delete attribs.src;
      }
      return { tagName, attribs };
    }
  }
};

export function sanitizeMarkdown(markdown: string, options: MarkdownSanitizeOptions = {}): string {
  const baseSchemesByTag = LITTLE_GLEN_SANITIZE_BASE.allowedSchemesByTag as Record<string, string[]>;
  const mergedOptions: IOptions = {
    ...LITTLE_GLEN_SANITIZE_BASE,
    allowedAttributes: { ...LITTLE_GLEN_SANITIZE_BASE.allowedAttributes },
    allowedSchemesByTag: { ...baseSchemesByTag }
  };

  if (options.allowRemoteImages) {
    const baseImgSchemes = baseSchemesByTag?.img ?? [];
    mergedOptions.allowedSchemesByTag = {
      ...(mergedOptions.allowedSchemesByTag as Record<string, string[]>),
      img: Array.from(new Set([...baseImgSchemes, 'http', 'https']))
    };
  }

  return sanitizeHtml(markdown ?? '', mergedOptions);
}

export function sanitizeInlineText(value: string | undefined | null): string {
  if (!value) {
    return '';
  }
  // Strip HTML tags/attributes and collapse whitespace
  const stripped = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) ?? '';
  return stripped.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}
