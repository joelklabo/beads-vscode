/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

const warnings: string[] = [];

function createVscodeStub() {
  const webviewHandlers: Array<(msg: any) => void> = [];
  const createdPanels: any[] = [];

  const vscodeStub = {
    env: { language: 'en' },
    workspace: { getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }), workspaceFolders: [] },
    window: {
      showWarningMessage: (msg: string) => { warnings.push(msg); return undefined; },
      createWebviewPanel: (_viewType: string, title: string) => {
        const panel: any = {
          title,
          webview: {
            html: '',
            onDidReceiveMessage: (fn: (msg: any) => void) => { webviewHandlers.push(fn); return { dispose() {} }; },
          },
          onDidDispose: () => ({ dispose() {} }),
        };
        createdPanels.push(panel);
        return panel;
      },
    },
    l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
    ViewColumn: { One: 1 },
  } as any;

  return { vscodeStub, webviewHandlers, createdPanels };
}

describe('panel message validation', () => {
  let restoreLoad: any;

  afterEach(() => {
    (Module as any)._load = restoreLoad;
    warnings.length = 0;
  });

  it('drops invalid messages in in-progress panel', async () => {
    const { vscodeStub, webviewHandlers, createdPanels } = createVscodeStub();
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') return vscodeStub;
      if (request.includes('../inProgress')) {
        return {
          getInProgressPanelHtml: () => '<html></html>',
          buildInProgressPanelStrings: () => ({ title: 'In Progress' }),
        };
      }
      if (request.includes('../shared/theme')) {
        return { buildSharedStyles: () => '' };
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../../views/panels/inProgressPanel')];
    delete require.cache[require.resolve('../../views/shared/theme')];
    delete require.cache[require.resolve('../../views/inProgress')];
    const panelModule = require('../../views/panels/inProgressPanel');
    await panelModule.openInProgressPanel({
      provider: { items: [{ id: 'X', status: 'in_progress' }], onDidChangeTreeData: () => ({ dispose() {} }) },
      openBead: async () => { throw new Error('should not be called'); },
    });

    assert.ok(createdPanels.length === 1, 'panel should be created');
    webviewHandlers[0]?.({ command: 'bad' });
    assert.ok(warnings.length > 0, 'warning should be emitted for invalid message');
  });

  it('does not throw if provider lacks refresh and items are empty', async () => {
    const { vscodeStub, createdPanels } = createVscodeStub();
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') return vscodeStub;
      if (request.includes('../inProgress')) {
        return {
          getInProgressPanelHtml: () => '<html></html>',
          buildInProgressPanelStrings: () => ({ title: 'In Progress' }),
        };
      }
      if (request.includes('../shared/theme')) {
        return { buildSharedStyles: () => '' };
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../../views/panels/inProgressPanel')];
    delete require.cache[require.resolve('../../views/shared/theme')];
    delete require.cache[require.resolve('../../views/inProgress')];
    const panelModule = require('../../views/panels/inProgressPanel');

    await panelModule.openInProgressPanel({
      provider: { items: [], onDidChangeTreeData: () => ({ dispose() {} }) },
      openBead: async () => undefined,
    });

    assert.strictEqual(createdPanels.length, 1, 'panel should be created even without refresh');
  });

  it('drops invalid messages in activity feed panel', async () => {
    const { vscodeStub, webviewHandlers, createdPanels } = createVscodeStub();
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') return vscodeStub;
      if (request.includes('../../activityFeed')) {
        return { fetchEvents: async () => ({ events: [], hasMore: false, totalCount: 0, nextCursor: undefined }) };
      }
      if (request.includes('../shared/theme')) {
        return { buildSharedStyles: () => '' };
      }
      if (request.includes('../activityFeed')) {
        return { getActivityFeedPanelHtml: () => '<html></html>' };
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../../views/panels/activityFeedPanel')];
    delete require.cache[require.resolve('../../views/shared/theme')];
    delete require.cache[require.resolve('../../views/activityFeed')];
    const panelModule = require('../../views/panels/activityFeedPanel');
    await panelModule.openActivityFeedPanel({
      activityFeedProvider: { onDidChangeTreeData: () => ({ dispose() {} }) },
      beadsProvider: { items: [] },
      openBead: async () => { throw new Error('should not be called'); },
      fetchEvents: async () => ({ events: [], hasMore: false, totalCount: 0, nextCursor: undefined }),
    });

    assert.ok(createdPanels.length === 1, 'panel should be created');
    webviewHandlers[0]?.({ command: 'bad' });
    assert.ok(warnings.length > 0, 'warning should be emitted for invalid message');
  });
});
