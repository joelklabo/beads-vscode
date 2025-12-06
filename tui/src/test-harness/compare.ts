import fs from 'fs';
import path from 'path';
import React from 'react';
import { PassThrough } from 'stream';
import { createHash } from 'crypto';
import App from '../app';
import { createMockStore } from './fixtures/mockStore';
import { renderTextToPng } from './pngSnapshot';
import { scenarios, ScenarioSpec } from './scenarios';
import { buildReport, ReportSnapshot } from './report';

type PixelmatchFn = typeof import('pixelmatch');
type PngCtor = typeof import('pngjs')['PNG'];

interface CompareOptions {
  update: boolean;
  tolerance: number;
  baselineDir: string;
  reportDir: string;
  scenarioFilter: string[];
}

interface CaptureResult {
  text: string;
  lines: string[];
  pngBuffer: Buffer;
  width: number;
  height: number;
}

function parseArgs(): CompareOptions {
  const args = process.argv.slice(2);
  const opts: CompareOptions = {
    update: false,
    tolerance: 0,
    baselineDir: path.resolve(process.cwd(), 'tui', '__snapshots__', 'baseline'),
    reportDir: path.resolve(process.cwd(), 'tmp', 'tui-visual-report'),
    scenarioFilter: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--update':
        opts.update = true;
        break;
      case '--tolerance':
        opts.tolerance = Number(args[i + 1] ?? opts.tolerance);
        i += 1;
        break;
      case '--output':
        opts.reportDir = path.resolve(args[i + 1]);
        i += 1;
        break;
      case '--baseline':
        opts.baselineDir = path.resolve(args[i + 1]);
        i += 1;
        break;
      case '--scenario':
        opts.scenarioFilter.push(args[i + 1]);
        i += 1;
        break;
      default:
        break;
    }
  }

  return opts;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function hash(value: string | Buffer): string {
  return createHash('sha1').update(value).digest('hex');
}

function padLines(lines: string[], width: number, height: number): string[] {
  const normalized = lines.map((line) => line.replace(/\r/g, ''));
  const padded = normalized.map((line) => {
    const truncated = line.length > width ? line.slice(0, width) : line;
    return truncated.padEnd(width, ' ');
  });
  while (padded.length < height) padded.push(' '.repeat(width));
  return padded.slice(0, height);
}

function normalizeText(content: string, width: number, height: number): { text: string; lines: string[] } {
  const parts = content.split('\n');
  const lines = padLines(parts, width, height);
  return { text: lines.join('\n'), lines };
}

function loadPixelmatch(): PixelmatchFn {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('pixelmatch') as PixelmatchFn;
  } catch (error) {
    throw new Error(
      'Missing pixelmatch dependency. Install pixelmatch (TUI visual test deps) or rerun with TUI_VISUAL_ENABLED=1 before npm install. Original: ' +
        (error as Error).message
    );
  }
}

function loadPng(): PngCtor {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PNG } = require('pngjs');
    return PNG as PngCtor;
  } catch (error) {
    throw new Error(
      'Missing pngjs dependency. Install pngjs (TUI visual test deps) or rerun with TUI_VISUAL_ENABLED=1 before npm install. Original: ' +
        (error as Error).message
    );
  }
}

function detectWorktreeId(cwd: string): string | undefined {
  const match = cwd.match(/\/worktrees\/([^/]+)\/([^/]+)/);
  if (match) return match[2];
  return undefined;
}

async function captureScenario(spec: ScenarioSpec): Promise<CaptureResult> {
  const width = spec.width ?? 80;
  const height = spec.height ?? 24;
  const { store, workspaces } = createMockStore();

  const { render } = await import('ink-testing-library');
  const stdout = new PassThrough();
  (stdout as any).columns = width;
  (stdout as any).rows = height;

  const ink = render(
    React.createElement(App, {
      cwd: process.cwd(),
      initialTab: spec.initialTab,
      simulateKeys: spec.keys,
      store,
      workspaces,
    }),
    { stdout }
  );

  await new Promise((resolve) => setTimeout(resolve, 80));
  const frame = ink.lastFrame() ?? '';
  ink.unmount();

  const { text, lines } = normalizeText(frame, width, height);
  const pngBuffer = renderTextToPng(lines, { cellWidth: 1, cellHeight: 1 });

  return { text, lines, pngBuffer, width, height };
}

function copyIfExists(from: string, to: string): string | undefined {
  if (!fs.existsSync(from)) return undefined;
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  return to;
}

function comparePngs(baselinePath: string, actualBuffer: Buffer, diffPath: string, tolerance: number): number {
  const PNG = loadPng();
  const pixelmatch = loadPixelmatch();
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const actual = PNG.sync.read(actualBuffer);

  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    throw new Error(`Image size mismatch: baseline ${baseline.width}x${baseline.height} vs actual ${actual.width}x${actual.height}`);
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(baseline.data, actual.data, diff.data, baseline.width, baseline.height, {
    threshold: tolerance,
    includeAA: false,
  });

  if (diffPixels > 0) {
    ensureDir(path.dirname(diffPath));
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  return diffPixels;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const worktreeId = detectWorktreeId(process.cwd());
  const workspacePaths = [process.cwd()];
  const selected = options.scenarioFilter.length
    ? options.scenarioFilter
    : Object.keys(scenarios);

  const missingScenarios = selected.filter((id) => !scenarios[id]);
  if (missingScenarios.length > 0) {
    console.error(`Unknown scenario(s): ${missingScenarios.join(', ')}`);
    process.exit(1);
  }

  const snapshots: ReportSnapshot[] = [];
  let hasFailures = false;

  for (const scenarioId of selected) {
    const spec = scenarios[scenarioId];
    const scenarioDir = path.join(options.reportDir, spec.id);
    ensureDir(scenarioDir);

    try {
      const capture = await captureScenario(spec);
      const baselineTextPath = path.join(options.baselineDir, `${spec.id}.txt`);
      const baselinePngPath = path.join(options.baselineDir, `${spec.id}.png`);

      const actualTextPath = path.join(scenarioDir, 'actual.txt');
      const actualPngPath = path.join(scenarioDir, 'actual.png');
      fs.writeFileSync(actualTextPath, capture.text, 'utf8');
      fs.writeFileSync(actualPngPath, capture.pngBuffer);

      let status: ReportSnapshot['status'] = 'pass';
      let message: string | undefined;
      let diffPath: string | undefined;
      let diffPixels = 0;
      let textDiff = false;

      if (options.update) {
        ensureDir(options.baselineDir);
        fs.writeFileSync(baselineTextPath, capture.text, 'utf8');
        fs.writeFileSync(baselinePngPath, capture.pngBuffer);
        status = 'updated';
      } else if (!fs.existsSync(baselineTextPath) || !fs.existsSync(baselinePngPath)) {
        status = 'fail';
        hasFailures = true;
        message = 'Baseline missing. Re-run with --update to create snapshots.';
      } else {
        const baselineText = fs.readFileSync(baselineTextPath, 'utf8');
        const normalizedBaseline = normalizeText(baselineText, capture.width, capture.height);
        const normalizedActual = normalizeText(capture.text, capture.width, capture.height);
        textDiff = normalizedBaseline.text !== normalizedActual.text;

        diffPath = path.join(scenarioDir, 'diff.png');
        diffPixels = comparePngs(baselinePngPath, capture.pngBuffer, diffPath, options.tolerance);

        if (diffPixels > 0 || textDiff) {
          status = 'fail';
          hasFailures = true;
          if (diffPixels > 0) {
            message = `Detected ${diffPixels} pixel difference(s).`;
          } else {
            message = 'Text snapshot differs from baseline.';
          }
        }

        if (diffPixels === 0) {
          diffPath = undefined;
        }
      }

      const meta = {
        scenario: spec,
        width: capture.width,
        height: capture.height,
        tolerance: options.tolerance,
        textDiff,
        diffPixels,
        textHash: hash(capture.text),
        pngHash: hash(capture.pngBuffer),
        updatedAt: new Date().toISOString(),
      };
      const metaPath = path.join(scenarioDir, 'meta.json');
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

      const baselineTextCopy = copyIfExists(baselineTextPath, path.join(scenarioDir, 'baseline.txt'));
      const baselinePngCopy = copyIfExists(baselinePngPath, path.join(scenarioDir, 'baseline.png'));

      snapshots.push({
        id: spec.id,
        name: spec.title,
        description: spec.description,
        status,
        baselineTextPath: baselineTextCopy,
        actualTextPath,
        baselinePngPath: baselinePngCopy,
        actualPngPath,
        diffPath,
        metaPath,
        message,
      });
    } catch (error) {
      hasFailures = true;
      const metaPath = path.join(scenarioDir, 'meta.json');
      const message = error instanceof Error ? error.message : String(error);
      fs.writeFileSync(metaPath, JSON.stringify({ error: message, scenario: scenarioId }, null, 2), 'utf8');

      snapshots.push({
        id: spec.id,
        name: spec.title,
        description: spec.description,
        status: 'fail',
        message,
        metaPath,
      });
    }
  }

  ensureDir(options.reportDir);
  const reportPath = path.join(options.reportDir, 'index.html');
  buildReport(snapshots, {
    title: 'TUI Visual Report',
    outputPath: reportPath,
    worktreeId,
    workspacePaths,
  });

  console.log(`Report written to ${reportPath}`);
  if (!options.update && hasFailures) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[compare] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
