import fs from 'fs';
import path from 'path';
import { redactLogContent } from '@beads/core/security/sanitize';

export interface ReportSnapshot {
  name: string;
  textPath?: string;
  pngPath?: string;
  diffPath?: string;
  metaPath?: string;
  description?: string;
}

export interface ReportOptions {
  title?: string;
  workspacePaths?: string[];
  worktreeId?: string;
  outputPath: string;
}

function sanitizeText(text: string, opts: ReportOptions): string {
  return redactLogContent(text, {
    workspacePaths: opts.workspacePaths,
    worktreeId: opts.worktreeId,
  });
}

function readMaybe(filePath?: string, opts?: ReportOptions): string | undefined {
  if (!filePath) return undefined;
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, 'utf8');
  return opts ? sanitizeText(raw, opts) : raw;
}

export function buildReport(snapshots: ReportSnapshot[], opts: ReportOptions): string {
  const title = opts.title || 'TUI Visual Report';
  const items = snapshots.map((snap, index) => {
    const text = readMaybe(snap.textPath, opts);
    const meta = readMaybe(snap.metaPath, opts);
    return { ...snap, text, meta, id: `snap-${index}` };
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0; }
    .card { border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #111827; }
    .card:focus { outline: 3px solid #38bdf8; outline-offset: 2px; }
    h1, h2 { margin: 0 0 8px 0; color: #f8fafc; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    img { max-width: 100%; border: 1px solid #334155; border-radius: 4px; }
    pre { background: #0b1220; color: #e2e8f0; padding: 8px; border-radius: 4px; overflow-x: auto; }
    .meta { color: #94a3b8; font-size: 12px; }
    a { color: #38bdf8; }
  </style>
</head>
<body>
  <header>
    <h1 tabindex="0">${title}</h1>
    <p class="meta">Redacted paths/tokens; accessible via keyboard (Tab/Shift+Tab). Images include descriptive alt text.</p>
  </header>
  <main class="grid">
    ${items
      .map((snap) => {
        const alt = snap.description || `${snap.name} snapshot`;
        const png = snap.pngPath ? `<img src="${path.basename(snap.pngPath)}" alt="${alt}" tabindex="0" />` : '';
        const diff = snap.diffPath ? `<img src="${path.basename(snap.diffPath)}" alt="${alt} diff" tabindex="0" />` : '';
        const textBlock = snap.text ? `<pre aria-label="${alt} text" tabindex="0">${escapeHtml(snap.text)}</pre>` : '';
        const metaBlock = snap.meta ? `<pre class="meta" aria-label="${alt} metadata" tabindex="0">${escapeHtml(snap.meta)}</pre>` : '';
        return `<section class="card" tabindex="0">
          <h2>${snap.name}</h2>
          ${png}
          ${diff}
          ${textBlock}
          ${metaBlock}
        </section>`;
      })
      .join('\n')}
  </main>
  <footer class="meta" tabindex="0">See docs/accessibility.md for TUI visual report expectations.</footer>
</body>
</html>`;

  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  fs.writeFileSync(opts.outputPath, html, 'utf8');
  return opts.outputPath;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
