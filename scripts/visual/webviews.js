/* Visual harness to capture Beady webviews as PNGs for quick QA.
 * Usage: npm run viz:webviews
 * CI usage: npm run ci:visual:webviews (artifacts saved under tmp/webview-visual)
 * Prereq: npm run compile (handled in the npm script).
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { chromium } = require('playwright');

process.env.TZ = process.env.TZ || 'UTC';

const args = process.argv.slice(2);
const parseArg = (flag, fallback) => {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
};

const fixedNow = process.env.BEADY_VISUAL_NOW
  ? new Date(process.env.BEADY_VISUAL_NOW)
  : new Date('2024-01-02T12:00:00Z');
const headless = process.env.BEADY_VISUAL_HEADLESS !== '0';
const outDir = path.resolve(
  parseArg('--out', process.env.BEADY_VISUAL_OUT || path.join('tmp', 'webview-visual'))
);

Date.now = () => fixedNow.getTime();

const repoRoot = path.resolve(__dirname, '..', '..');
const outPath = (...parts) => path.join(repoRoot, 'out', ...parts);

// Stub vscode for the compiled HTML builders
const realLoad = Module._load;
Module._load = (request, parent, isMain) => {
  if (request === 'vscode') {
    const t = (message, ...args) =>
      message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`));
    const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
    class ThemeIcon {
      constructor(id, color) { this.id = id; this.color = color; }
    }
    class ThemeColor {
      constructor(id) { this.id = id; }
    }
    class TreeItem {
      constructor(label, collapsibleState = TreeItemCollapsibleState.None) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    }
    return {
      l10n: { t },
      env: { language: 'en' },
      workspace: {
        getConfiguration: () => ({
          get: (_key, fallback) => fallback,
        }),
        workspaceFolders: [{ uri: { fsPath: repoRoot } }],
      },
      TreeItem,
      TreeItemCollapsibleState,
      ThemeIcon,
      ThemeColor,
      Uri: {
        file: (fsPath) => ({ fsPath, toString: () => fsPath }),
        joinPath: (base, ...parts) => {
          const fsPath = path.join(base.fsPath || base, ...parts);
          return { fsPath, toString: () => fsPath };
        },
      },
      window: {
        showWarningMessage: () => undefined,
        showErrorMessage: () => undefined,
      },
    };
  }
  return realLoad(request, parent, isMain);
};

// Import compiled HTML builders
const { getBeadDetailHtml } = require(outPath('views/detail/html.js'));
const { getInProgressPanelHtml, buildInProgressPanelStrings } = require(outPath('views/inProgress/html.js'));
const { getActivityFeedPanelHtml } = require(outPath('views/activityFeed/html.js'));
const { buildSharedStyles } = require(outPath('views/shared/theme.js'));
const { buildBeadDetailStrings, getStatusLabels } = require(outPath('providers/beads/treeDataProvider.js'));
const { buildDependencyTrees } = require(outPath('utils/graph.js'));
const issuesBundle = fs.readFileSync(outPath('views/issues/index.js'), 'utf8');

// Fixture data
const shift = (ms) => new Date(fixedNow.getTime() + ms).toISOString();

const sampleBeads = [
  {
    id: 'BD-1',
    title: 'Polish badge alignment',
    status: 'in_progress',
    issueType: 'task',
    priority: 1,
    assignee: 'Ada Lovelace',
    inProgressSince: shift(-4 * 60 * 60 * 1000),
    raw: {
      description: 'Align chips across task list and detail views.',
      design: 'Use shared chip tokens.',
      acceptance_criteria: 'Badges line up; no jitter.',
      notes: 'Check compact mode.',
      issue_type: 'task',
      priority: 1,
      updated_at: shift(-10 * 60 * 1000),
      created_at: shift(-2 * 24 * 60 * 60 * 1000),
      labels: ['ui', 'visual'],
      dependencies: [{ depends_on_id: 'BD-2', dep_type: 'blocks' }],
    },
  },
  {
    id: 'BD-2',
    title: 'Shared token clean-up',
    status: 'open',
    issueType: 'feature',
    priority: 2,
    assignee: 'Grace Hopper',
    raw: {
      description: 'Refine shared theme tokens.',
      issue_type: 'feature',
      priority: 2,
      updated_at: shift(-30 * 60 * 1000),
      created_at: shift(-3 * 24 * 60 * 60 * 1000),
      labels: ['tokens'],
      dependencies: [],
    },
  },
];

const sampleEvents = [
  {
    issueId: 'BD-1',
    issueTitle: 'Polish badge alignment',
    actor: 'Ada Lovelace',
    createdAt: new Date(fixedNow),
    description: 'Status changed to In Progress',
    colorClass: 'event-created',
    iconName: 'sparkle',
    issueType: 'task',
  },
  {
    issueId: 'BD-2',
    issueTitle: 'Shared token clean-up',
    actor: 'Grace Hopper',
    createdAt: new Date(fixedNow.getTime() - 60 * 60 * 1000),
    description: 'Commented on design tokens',
    colorClass: 'event-info',
    iconName: 'comment',
    issueType: 'feature',
  },
];

function buildDetailHtml() {
  const bead = sampleBeads[0];
  const statusLabels = getStatusLabels();
  const strings = buildBeadDetailStrings(statusLabels);
  const webviewStub = { cspSource: 'http://localhost' };
  return getBeadDetailHtml(
    bead,
    sampleBeads,
    webviewStub,
    'nonce',
    strings,
    'en'
  );
}

function buildInProgressHtml() {
  return getInProgressPanelHtml(
    sampleBeads,
    buildInProgressPanelStrings(),
    'en'
  );
}

function buildActivityFeedHtml() {
  return getActivityFeedPanelHtml(sampleEvents, {
    title: 'Activity Feed',
    emptyTitle: 'No activity',
    emptyDescription: 'Events will appear here.',
    eventsLabel: 'events',
  }, 'en');
}

async function capture(page, html, name, waitForSelector = '.bead-chip') {
  await page.setContent(html, { waitUntil: 'networkidle' });
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 2000 }).catch(() => undefined);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Saved ${file}`);
  return file;
}

async function captureIssues() {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const codicons = 'https://microsoft.github.io/vscode-codicons/dist/codicon.css';
  const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="${codicons}">
    <style>${buildSharedStyles()}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.vscode = {
        postMessage: () => {},
        getState: () => null,
        setState: () => {}
      };
    </script>
    <script>${issuesBundle}</script>
  </body>
</html>`;

  await page.setContent(html, { waitUntil: 'networkidle' });
  const payload = { type: 'update', beads: sampleBeads, sortMode: 'status' };
  await page.evaluate((data) => {
    window.dispatchEvent(new MessageEvent('message', { data }));
  }, payload);
  await page.waitForSelector('.bead-row', { timeout: 2000 }).catch(() => undefined);

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'issues.png');
  await page.screenshot({ path: file, fullPage: true });
  await browser.close();
  console.log(`Saved ${file}`);
  return file;
}

async function main() {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Prime dependency trees (detail HTML needs them)
  buildDependencyTrees(sampleBeads, sampleBeads[0].id);
  const captures = [];
  captures.push({ name: 'detail', file: await capture(page, buildDetailHtml(), 'detail') });
  captures.push({ name: 'in-progress', file: await capture(page, buildInProgressHtml(), 'in-progress') });
  captures.push({ name: 'activity-feed', file: await capture(page, buildActivityFeedHtml(), 'activity-feed') });
  await browser.close();
  captures.push({ name: 'issues', file: await captureIssues() });

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({
      generatedAt: new Date(fixedNow).toISOString(),
      headless,
      outDir,
      captures,
    }, null, 2)
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    Module._load = realLoad;
  });
