/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');
import { PULSE_ANIMATION_NAME } from '../../views/shared/theme';

const webviewHandlers: Array<(msg: any) => void> = [];
const createdPanels: any[] = [];
const noop = () => undefined;

const vscodeStub = {
  env: { language: 'en', clipboard: { writeText: async () => undefined } },
  l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
  commands: { registerCommand: () => ({ dispose: noop }), executeCommand: noop },
  workspace: {
    getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }),
    workspaceFolders: [],
    onDidChangeConfiguration: () => ({ dispose: noop }),
    onDidChangeWorkspaceFolders: () => ({ dispose: noop }),
  },
  window: {
    createWebviewPanel: (_v: string, _title: string) => {
      const panel: any = {
        webview: {
          html: '',
          onDidReceiveMessage: (fn: (msg: any) => void) => {
            webviewHandlers.push(fn);
            return { dispose() {} };
          },
        },
        onDidDispose: () => ({ dispose() {} }),
      };
      createdPanels.push(panel);
      return panel;
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    registerWebviewViewProvider: () => ({ dispose: noop }),
    createTreeView: () => ({ selection: [], onDidChangeSelection: () => ({ dispose: noop }) }),
    createStatusBarItem: () => ({ dispose: noop }),
  },
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  Uri: { parse: (u: string) => ({ toString: () => u, fsPath: u }), file: (p: string) => ({ fsPath: p, path: p }), joinPath: (base: any) => base },
  EventEmitter: class { private listeners: any[] = []; event = (listener: any) => { this.listeners.push(listener); return { dispose: noop }; }; fire(data: any) { this.listeners.forEach((l) => l(data)); } dispose() { this.listeners = []; } },
  TreeItem: class { constructor(public label?: any, public collapsibleState?: any) {} },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(public id: string, public color?: any) {} },
  ThemeColor: class { constructor(public id: string) {} },
  MarkdownString: class { value = ''; appendMarkdown(text: string) { this.value += text; } },
  chat: { createChatParticipant: () => ({ dispose: noop }) },
  StatusBarAlignment: { Left: 1, Right: 2 },
};

const originalLoad = (Module as any)._load;
const withVscodeStub = async <T>(fn: () => T | Promise<T>): Promise<T> => {
  const before = new Set(Object.keys(require.cache));
  let vscodeCacheKey: string | undefined;
  Object.keys(require.cache).forEach((key) => { if (key.includes('vscode')) { delete require.cache[key]; } });
  try {
    vscodeCacheKey = require.resolve('vscode');
    delete require.cache[vscodeCacheKey];
  } catch {
    vscodeCacheKey = undefined;
  }
  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../../views/panels/activityFeedPanel')];
    return await fn();
  } finally {
    (Module as any)._load = originalLoad;
    // Clear any modules that were loaded while the stub was active to avoid leaking stubs across suites.
    for (const key of Object.keys(require.cache)) {
      if (!before.has(key)) {
        delete require.cache[key];
      }
    }
    if (vscodeCacheKey) {
      delete require.cache[vscodeCacheKey];
    }
  }
};

describe('activity feed panel badges', () => {
  it('injects shared token CSS and renders status/type chips with pulsing in_progress', async () => {
    await withVscodeStub(async () => {
      const { openActivityFeedPanel } = require('../../views/panels/activityFeedPanel');
      const beadsProvider: any = { items: [{ id: 'b-2', status: 'in_progress' }] };
      const activityFeedProvider: any = { onDidChangeTreeData: () => ({ dispose() {} }) };

      const eventTime = new Date('2024-01-01T00:00:00Z');
      await openActivityFeedPanel({
        activityFeedProvider,
        beadsProvider,
        openBead: async () => undefined,
        fetchEvents: async () => ({
          events: [{
            issueId: 'b-2',
            issueTitle: 'Polish badges',
            iconName: 'sparkle',
            colorClass: 'event-created',
            description: 'status changed',
            actor: 'Avery',
            createdAt: eventTime,
            issueType: 'feature',
          }, {
            issueId: 'b-3',
            issueTitle: 'Blocked badge',
            iconName: 'flame',
            colorClass: 'event-warning',
            description: 'blocked work',
            actor: 'Riley',
            createdAt: eventTime,
            issueType: 'bug',
          }],
          totalCount: 1,
          hasMore: false,
        }),
        getProjectRoot: () => '',
        locale: 'en',
      });

      const html = createdPanels[0]?.webview.html || '';

      assert.ok(html.includes(PULSE_ANIMATION_NAME), 'shared token CSS missing');
      assert.ok(html.includes('bead-chip status status-in_progress'), 'status chip missing');
      assert.ok(html.includes('bead-chip type type-feature'), 'type chip missing');
      assert.ok(html.includes('timeline-dot pulsing'), 'in_progress pulse class missing');
      assert.ok(html.includes('bead-chip type type-bug'), 'second event type chip missing');
      assert.ok(html.match(/timeline-dot/g)?.length === 2, 'should render timeline dots per event');
    });
  });
});
