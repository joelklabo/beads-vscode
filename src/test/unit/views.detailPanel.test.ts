/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

const webviewHandlers: Array<(msg: any) => void> = [];
const createdPanels: any[] = [];
const warnings: string[] = [];

const vscodeStub = {
  env: { language: 'en', openExternal: async () => undefined },
  workspace: {
    getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }),
    workspaceFolders: [],
  },
  window: {
    showInformationMessage: () => undefined,
    showWarningMessage: (msg: string) => {
      warnings.push(msg);
      return undefined;
    },
    showInputBox: async () => undefined,
    createWebviewPanel: (_v: string, _title: string) => {
      const panel: any = {
        webview: {
          html: '',
          cspSource: 'vscode-resource',
          onDidReceiveMessage: (fn: (msg: any) => void) => {
            webviewHandlers.push(fn);
            return { dispose() {} };
          },
        },
        dispose: () => undefined,
        onDidDispose: () => ({ dispose() {} }),
      };
      createdPanels.push(panel);
      return panel;
    },
  },
  l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
  Uri: {
    file: (p: string) => ({ fsPath: p, path: p }),
    joinPath: (base: any) => base,
    parse: (u: string) => ({ toString: () => u }),
  },
  ViewColumn: { One: 1 },
  TreeItem: class { constructor(public label?: any, public collapsibleState?: any) {} },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(public id: string) {} },
};

let openBeadPanel: any;
let openBeadFromFeed: any;
let restoreLoad: any;

describe('detail panel helper', () => {
  beforeEach(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    moduleAny._load = function (request: string, parent: any, isMain: boolean) {
      if (request === 'vscode') return vscodeStub;
      if (request.includes('services/cliService')) return { runBdCommand: async () => undefined };
      if (request.includes('providers/beads/treeDataProvider')) return {
        BeadsTreeDataProvider: class {},
        buildBeadDetailStrings: () => ({} as any),
        getStatusLabels: () => ({} as any),
      };
      if (request.includes('views/detail/html')) return { getBeadDetailHtml: () => '<html nonce="nonce"></html>' };
      if (request.includes('providers/beads/items')) return { BeadTreeItem: class {}, EpicTreeItem: class {} };
      if (request.includes('commands/dependencies')) return { addDependencyCommand: async () => undefined, removeDependencyCommand: async () => undefined };
      if (request === '../../commands') return { editAssignee: async () => undefined };
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../../views/detail/html')];
    delete require.cache[require.resolve('../../views/detail/panel')];
    delete require.cache[require.resolve('../../utils')];

    webviewHandlers.length = 0;
    createdPanels.length = 0;
    warnings.length = 0;
    const htmlPath = require.resolve('../../views/detail/html');
    require.cache[htmlPath] = { exports: { getBeadDetailHtml: () => '<html nonce="nonce"></html>' } } as any;
    const panel = require('../../views/detail/panel');
    openBeadPanel = panel.openBeadPanel;
    openBeadFromFeed = panel.openBeadFromFeed;
  });

  afterEach(() => {
    (Module as any)._load = restoreLoad;
  });

  it('renders detail html with nonce and registers panel', async () => {
    const provider: any = {
      items: [{ id: 'b-1', status: 'open', raw: {} } as any],
      registerPanel: () => { provider.registered = true; },
      updateStatus: async () => {},
      updateTitle: async () => {},
      updateDescription: async () => {},
      updateDesign: async () => {},
      updateAcceptanceCriteria: async () => {},
      updateNotes: async () => {},
      updateType: async () => {},
      updatePriority: async () => {},
      addLabel: async () => {},
      removeLabel: async () => {},
      updateAssignee: async () => {},
    };

    await openBeadPanel(provider.items[0], provider, async () => undefined);

    assert.ok(createdPanels[0], 'panel not created');
    assert.ok(provider.registered, 'panel not registered');
    assert.ok(createdPanels[0].webview.html.includes('nonce'), 'nonce not set in html');
  });

  it('ignores invalid webview messages', async () => {
    const provider: any = {
      items: [{ id: 'b-1', status: 'open', raw: {} } as any],
      registerPanel: () => {},
      updateStatus: () => { provider.statusCalled = true; },
      updateTitle: () => { provider.titleCalled = true; },
      updateDescription: () => {},
      updateDesign: () => {},
      updateAcceptanceCriteria: () => {},
      updateNotes: () => {},
      updateType: () => {},
      updatePriority: () => {},
      addLabel: () => {},
      removeLabel: () => {},
    };

    await openBeadPanel(provider.items[0], provider, async () => undefined);
    webviewHandlers[0]?.({ command: 'not-allowed' });

    assert.ok(!provider.statusCalled && !provider.titleCalled, 'handler should not run for invalid message');
    assert.ok(warnings.length > 0, 'warning should be shown for invalid message');
  });

  it('returns false when bead not found from feed', async () => {
    const provider: any = { items: [{ id: 'b-2', status: 'open', raw: {} } as any] };
    const result = await openBeadFromFeed('missing', provider, async () => undefined);

    assert.strictEqual(result, false);
    assert.ok(warnings.some((w) => w.includes('no longer exists')));
  });
});
