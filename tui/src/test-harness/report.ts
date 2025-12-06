import fs from 'fs';
import path from 'path';
import { redactLogContent } from '@beads/core/security/sanitize';

export type SnapshotStatus = 'pass' | 'fail' | 'updated';

export interface ReportSnapshot {
  id: string;
  name: string;
  description?: string;
  status: SnapshotStatus;
  baselineTextPath?: string;
  actualTextPath?: string;
  baselinePngPath?: string;
  actualPngPath?: string;
  diffPath?: string;
  metaPath?: string;
  message?: string;
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

function readMaybe(filePath: string | undefined, opts: ReportOptions): string | undefined {
  if (!filePath) return undefined;
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, 'utf8');
  return sanitizeText(raw, opts);
}

function relativeToReport(target: string | undefined, outputPath: string): string | undefined {
  if (!target) return undefined;
  const rel = path.relative(path.dirname(outputPath), target);
  return rel.replace(/\\/g, '/');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildReport(snapshots: ReportSnapshot[], opts: ReportOptions): string {
  const title = opts.title || 'TUI Visual Report';

  const items = snapshots.map((snap, index) => {
    const baselineText = readMaybe(snap.baselineTextPath, opts);
    const actualText = readMaybe(snap.actualTextPath, opts);
    const meta = readMaybe(snap.metaPath, opts);
    return {
      ...snap,
      anchor: `snap-${index}`,
      baselineText,
      actualText,
      meta,
      relBaselinePng: relativeToReport(snap.baselinePngPath, opts.outputPath),
      relActualPng: relativeToReport(snap.actualPngPath, opts.outputPath),
      relDiff: relativeToReport(snap.diffPath, opts.outputPath),
      relMeta: relativeToReport(snap.metaPath, opts.outputPath),
    };
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; background: #0b1220; color: #e2e8f0; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 22px; }
    .hint { color: #94a3b8; font-size: 14px; }
    .kbd { background: #1f2937; color: #e2e8f0; padding: 2px 6px; border-radius: 6px; border: 1px solid #334155; font-size: 12px; }
    .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .card { border: 1px solid #1f2a44; border-radius: 12px; padding: 12px; background: #0f172a; outline: none; }
    .card:focus { outline: 3px solid #38bdf8; outline-offset: 2px; }
    .card-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .pill { border-radius: 999px; padding: 4px 10px; font-size: 12px; letter-spacing: 0.4px; text-transform: uppercase; }
    .status-pass { background: #0f5132; color: #d1e7dd; }
    .status-fail { background: #842029; color: #f8d7da; }
    .status-updated { background: #1d4ed8; color: #e0e7ff; }
    .desc { margin: 4px 0 0 0; color: #cbd5e1; font-size: 14px; }
    .message { margin: 4px 0 0 0; color: #fbbf24; font-size: 13px; }
    .media-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-bottom: 10px; }
    figure { margin: 0; padding: 0; }
    figcaption { font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
    img { max-width: 100%; border: 1px solid #1f2a44; border-radius: 6px; background: #0b1220; }
    .diff { display: none; }
    body.show-diff .diff { display: block; }
    details { margin-top: 8px; }
    summary { cursor: pointer; color: #a5b4fc; }
    pre { background: #0b1220; color: #e2e8f0; padding: 8px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
    .meta-block { color: #94a3b8; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(title)}</h1>
      <p class="hint">Keyboard: <span class="kbd">←/k</span> prev, <span class="kbd">→/j</span> next, <span class="kbd">d</span> toggle diff, <span class="kbd">Tab</span> focus cards.</p>
    </div>
    <div class="hint">${escapeHtml(new Date().toISOString())}</div>
  </header>
  <main class="cards">
    ${items
      .map((snap) => {
        const altBase = escapeHtml(`${snap.name} baseline`);
        const altActual = escapeHtml(`${snap.name} actual`);
        const altDiff = escapeHtml(`${snap.name} diff`);
        return `<section class="card" id="${snap.anchor}" tabindex="0" data-status="${snap.status}">
          <div class="card-header">
            <span class="pill status-${snap.status}">${snap.status}</span>
            <div>
              <div><strong>${escapeHtml(snap.name)}</strong></div>
              ${snap.description ? `<div class="desc">${escapeHtml(snap.description)}</div>` : ''}
              ${snap.message ? `<div class="message">${escapeHtml(snap.message)}</div>` : ''}
            </div>
          </div>
          <div class="media-grid">
            ${snap.relBaselinePng ? `<figure><figcaption>Baseline</figcaption><img src="${snap.relBaselinePng}" alt="${altBase}" /></figure>` : ''}
            ${snap.relActualPng ? `<figure><figcaption>Actual</figcaption><img src="${snap.relActualPng}" alt="${altActual}" /></figure>` : ''}
            ${snap.relDiff ? `<figure class="diff"><figcaption>Diff</figcaption><img src="${snap.relDiff}" alt="${altDiff}" /></figure>` : ''}
          </div>
          <details>
            <summary>Text snapshots</summary>
            <div class="media-grid">
              ${snap.baselineText ? `<figure><figcaption>Baseline</figcaption><pre>${escapeHtml(snap.baselineText)}</pre></figure>` : ''}
              ${snap.actualText ? `<figure><figcaption>Actual</figcaption><pre>${escapeHtml(snap.actualText)}</pre></figure>` : ''}
            </div>
          </details>
          ${snap.meta ? `<details class="meta-block"><summary>Metadata</summary><pre>${escapeHtml(snap.meta)}</pre></details>` : ''}
        </section>`;
      })
      .join('\n')}
  </main>

  <script>
    (() => {
      const cards = Array.from(document.querySelectorAll('.card'));
      let index = 0;
      function focusCard(next) {
        if (cards.length === 0) return;
        index = (next + cards.length) % cards.length;
        cards[index].focus({ preventScroll: false });
        cards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      document.addEventListener('keydown', (event) => {
        if (['ArrowRight', 'j', 'n'].includes(event.key)) {
          event.preventDefault();
          focusCard(index + 1);
        } else if (['ArrowLeft', 'k', 'p'].includes(event.key)) {
          event.preventDefault();
          focusCard(index - 1);
        } else if (event.key === 'd' || event.key === 'D') {
          event.preventDefault();
          document.body.classList.toggle('show-diff');
        }
      });
      focusCard(0);
    })();
  </script>
</body>
</html>`;

  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  fs.writeFileSync(opts.outputPath, html, 'utf8');
  return opts.outputPath;
}
