/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');
import type { BeadItemData } from '../../utils';

const webviewHandlers: Array<(msg: any) => void> = [];
const createdPanels: any[] = [];

const vscodeStub = {
  env: { language: 'en' },
  workspace: {
    getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }),
    workspaceFolders: [],
  },
  window: {
    showInformationMessage: () => undefined,
    showWarningMessage: () => undefined,
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
  },
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
};

let openInProgressPanel: any;
let openActivityFeedPanel: any;
let BeadItemData: any;
let restoreLoad: any;

describe('view panel helpers', () => {
  beforeEach(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    moduleAny._load = function (request: string, parent: any) {
      if (request === 'vscode') return vscodeStub;
      return restoreLoad(request, parent);
    };

    delete require.cache[require.resolve('../../views/panels/inProgressPanel')];
    delete require.cache[require.resolve('../../views/panels/activityFeedPanel')];
    delete require.cache[require.resolve('../../utils')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    openInProgressPanel = require('../../views/panels/inProgressPanel').openInProgressPanel;
    openActivityFeedPanel = require('../../views/panels/activityFeedPanel').openActivityFeedPanel;
    BeadItemData = require('../../utils').BeadItemData;
    webviewHandlers.length = 0;
    createdPanels.length = 0;
  });

  afterEach(() => {
    (Module as any)._load = restoreLoad;
  });

  it('openInProgressPanel wires openBead message', async () => {
    let opened = '';
    const provider: any = {
      items: [{ id: 'b-1', status: 'in_progress' } as BeadItemData],
      onDidChangeTreeData: () => ({ dispose() {} }),
      refresh: () => Promise.resolve(),
    };

    await openInProgressPanel({ provider, openBead: async (item: BeadItemData) => { opened = item.id; } });
    assert.ok(createdPanels[0], 'panel not created');
    assert.ok(createdPanels[0].webview.html.includes('bead-chip status status-in_progress'));

    webviewHandlers[0]?.({ command: 'openBead', beadId: 'b-1' });
    assert.strictEqual(opened, 'b-1');
  });

  it('openActivityFeedPanel validates and opens bead', async () => {
    let opened = '';
    const beadsProvider: any = { items: [{ id: 'b-2', status: 'open' } as BeadItemData] };
    const activityFeedProvider: any = { onDidChangeTreeData: () => ({ dispose() {} }) };
    const events = [{ issueId: 'b-2', iconName: 'sparkle', colorClass: 'event-info', description: 'hi', actor: 'me', createdAt: new Date(), issueTitle: 't' } as any];

    await openActivityFeedPanel({
      activityFeedProvider,
      beadsProvider,
      openBead: async (item: BeadItemData) => { opened = item.id; },
      fetchEvents: async () => ({ events, totalCount: events.length, hasMore: false }),
      getProjectRoot: () => '',
      locale: 'en',
    });

    assert.ok(createdPanels[0].webview.html.includes('bead-chip status'), 'status chip missing in html');
    webviewHandlers[0]?.({ command: 'openBead', beadId: 'b-2' });
    assert.strictEqual(opened, 'b-2');
  });
});
