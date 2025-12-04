import * as assert from 'assert';
import { sanitizeMarkdown } from '../utils';
import { renderPanelHtml } from '../littleGlen/vscodePanel';
import { renderHoverHtml } from '../littleGlen/hover';

describe('Little Glen sanitization', () => {
  it('removes scripts and inline event handlers', () => {
    const dirty = '<div onclick="alert(1)">Click<script>alert(1)</script></div>';
    const cleaned = sanitizeMarkdown(dirty);

    assert.ok(!cleaned.includes('onclick'));
    assert.ok(!cleaned.includes('<script'));
    assert.ok(cleaned.includes('<div>Click</div>'));
  });

  it('strips javascript: URLs from links', () => {
    const dirty = '<a href="javascript:alert(1)">hack</a>';
    const cleaned = sanitizeMarkdown(dirty);

    assert.ok(!/javascript:/i.test(cleaned));
    assert.ok(cleaned.includes('<a'));
  });

  it('normalizes safe links with rel/target', () => {
    const cleaned = sanitizeMarkdown('<a href="https://example.com">site</a>');

    assert.ok(cleaned.includes('href="https://example.com"'));
    assert.ok(cleaned.includes('target="_blank"'));
    assert.ok(cleaned.includes('rel="noopener noreferrer"'));
  });

  it('blocks remote images by default but keeps data images', () => {
    const remote = sanitizeMarkdown('<img src="http://evil.test/x.png" alt="remote">');
    assert.ok(!remote.includes('http://evil.test/x.png'));

    const dataImg = sanitizeMarkdown('<img src="data:image/png;base64,aaaa" alt="ok">');
    assert.ok(dataImg.includes('data:image/png;base64,aaaa'));
  });

  it('can opt-in to remote images when explicitly allowed', () => {
    const allowed = sanitizeMarkdown('<img src="https://example.com/logo.png">', { allowRemoteImages: true });
    assert.ok(allowed.includes('https://example.com/logo.png'));
  });

  it('drops non-image data payloads from images', () => {
    const cleaned = sanitizeMarkdown('<img src="data:text/html,<script>alert(1)</script>">');
    assert.ok(!cleaned.includes('data:text/html'));
  });

  it('renders panel HTML with CSP and sanitized body', () => {
    const html = renderPanelHtml('<p>Hello</p><script>alert(1)</script>', { title: '<img src=x>' });

    assert.ok(html.includes('Content-Security-Policy'));
    assert.ok(html.includes('<div class="lg-content"><p>Hello</p></div>'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    // title is escaped, not rendered as HTML
    assert.ok(html.includes('<h1>&lt;img src=x&gt;</h1>'));
  });

  it('sanitizes hover HTML', () => {
    const html = renderHoverHtml('<p><img src="http://evil.test/x.png">Hi</p>');
    assert.ok(!html.includes('http://evil.test/x.png'));
    assert.ok(html.includes('<p>'));
  });
});
