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
    delete require.cache[require.resolve('../../views/panels/inProgressPanel')];
    return await fn();
  } finally {
    (Module as any)._load = originalLoad;
    // Clear any modules loaded under the stub so later suites can inject their own vscode shapes.
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

describe('in-progress panel badges', () => {
  it('renders shared token CSS and chip classes for in-progress cards', async () => {
    await withVscodeStub(async () => {
      const { openInProgressPanel } = require('../../views/panels/inProgressPanel');
      const items = [{
        id: 'b-5',
        title: 'Hero pulse',
        status: 'in_progress',
        inProgressSince: '2024-01-01T00:00:00Z',
        raw: { priority: 1, issue_type: 'feature' },
      }];
      const provider: any = {
        items,
        refresh: async () => undefined,
        onDidChangeTreeData: () => ({ dispose() {} }),
      };

      await openInProgressPanel({ provider, openBead: async () => undefined, locale: 'en' });

      const html = createdPanels[0]?.webview.html || '';

      assert.ok(html.includes(PULSE_ANIMATION_NAME), 'shared token CSS missing');
      assert.ok(html.includes('bead-chip status status-in_progress'), 'status chip missing');
      assert.ok(html.includes('bead-chip priority priority-1'), 'priority chip missing');
      assert.ok(html.includes('bead-chip type type-feature'), 'type chip missing');
      assert.ok(html.includes('status-in_progress') && html.includes('pulsing'), 'in_progress pulse missing');
      assert.ok(html.includes('bead-chip assignee'), 'assignee chip missing');
      assert.ok(html.includes('meta-item subtle'), 'metrics row should include meta items');
    });
  });
});
