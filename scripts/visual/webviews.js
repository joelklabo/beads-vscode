/* Visual harness to capture Beady webviews as PNGs for quick QA.
 * Usage: npm run viz:webviews
 * Prereq: npm run compile (handled in the npm script).
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { chromium } = require('playwright');

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

// Fixture data
const sampleBeads = [
  {
    id: 'BD-1',
    title: 'Polish badge alignment',
    status: 'in_progress',
    issueType: 'task',
    priority: 1,
    assignee: 'Ada Lovelace',
    inProgressSince: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    raw: {
      description: 'Align chips across task list and detail views.',
      design: 'Use shared chip tokens.',
      acceptance_criteria: 'Badges line up; no jitter.',
      notes: 'Check compact mode.',
      issue_type: 'task',
      priority: 1,
      updated_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
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
      updated_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
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
    createdAt: new Date(),
    description: 'Status changed to In Progress',
    colorClass: 'event-created',
    iconName: 'sparkle',
    issueType: 'task',
  },
  {
    issueId: 'BD-2',
    issueTitle: 'Shared token clean-up',
    actor: 'Grace Hopper',
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
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

async function capture(html, name) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  const outDir = path.join(repoRoot, 'tmp', 'webview-visual');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await browser.close();
  console.log(`Saved ${file}`);
}

async function main() {
  // Prime dependency trees (detail HTML needs them)
  buildDependencyTrees(sampleBeads, sampleBeads[0].id);
  await capture(buildDetailHtml(), 'detail');
  await capture(buildInProgressHtml(), 'in-progress');
  await capture(buildActivityFeedHtml(), 'activity-feed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    Module._load = realLoad;
  });
