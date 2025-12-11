/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

function createVscodeStub() {
  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    public event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data?: T): void {
      this.listeners.forEach(listener => listener(data as T));
    }
    dispose(): void {
      this.listeners = [];
    }
  }

  class MarkdownString {
    value = '';
    isTrusted = false;
    supportHtml = false;
    appendMarkdown(md: string): void {
      this.value += md;
    }
  }

  class ThemeIcon {
    constructor(public id: string, public color?: any) {}
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  class TreeItem {
    public label?: any;
    public collapsibleState: number;
    public iconPath?: any;
    public description?: string;
    public tooltip?: any;
    public contextValue?: string;
    public command?: any;

    constructor(label?: any, collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  const warnings: string[] = [];
  const errors: string[] = [];
  const info: string[] = [];

  const vscodeStub = {
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    TreeItem,
    ThemeIcon,
    ThemeColor,
    MarkdownString,
    EventEmitter,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    workspace: {
      workspaceFolders: [] as any[],
      getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }),
      createFileSystemWatcher: () => ({
        onDidChange: () => ({ dispose: () => undefined }),
        onDidCreate: () => ({ dispose: () => undefined }),
        dispose: () => undefined,
      }),
    },
    window: {
      __warnings: warnings,
      __errors: errors,
      __info: info,
      showWarningMessage: (msg: string) => { warnings.push(msg); },
      showErrorMessage: (msg: string) => { errors.push(msg); },
      showInformationMessage: (msg: string) => { info.push(msg); },
      createTreeView: () => ({ selection: [], onDidChangeSelection: () => ({ dispose() {} }) }),
      createStatusBarItem: () => ({ show() {}, hide() {}, text: '', dispose() {} }),
      createWebviewPanel: () => ({
        webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }) },
        onDidDispose: () => ({ dispose() {} })
      }),
    },
    RelativePattern: class {},
    commands: {
      registerCommand: () => ({ dispose: () => undefined }),
      executeCommand: () => undefined,
    },
    StatusBarAlignment: { Left: 1 },
  } as any;

  return vscodeStub;
}

describe('Activity feed open behavior', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let ActivityEventItem: any;
  let openBeadFromFeed: any;

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub();
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    ActivityEventItem = require('../../activityFeedProvider').ActivityEventItem;
    openBeadFromFeed = require('../../extension').openBeadFromFeed;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('assigns a command that targets the issue id', () => {
    const event = {
      id: 1,
      issueId: 'BD-123',
      issueTitle: 'Example',
      eventType: 'created',
      actor: 'user',
      oldValue: null,
      newValue: null,
      comment: null,
      createdAt: new Date(),
      description: 'Issue created',
      iconName: 'sparkle',
      colorClass: 'event-created',
    };

    const item = new ActivityEventItem(event);
    assert.strictEqual(item.command?.command, 'beady.activityFeed.openEvent');
    assert.deepStrictEqual(item.command?.arguments, [event.issueId]);
  });

  it('opens bead when present and returns true', async () => {
    const calls: string[] = [];
    const provider = { items: [{ id: 'BD-1', title: 'Test', status: 'open' }] };

    const result = await openBeadFromFeed('BD-1', provider as any, async (item: any) => {
      calls.push(item.id);
    });

    assert.strictEqual(result, true);
    assert.deepStrictEqual(calls, ['BD-1']);
    assert.strictEqual(vscodeStub.window.__warnings.length, 0);
  });

  it('shows fallback message when bead is missing and returns false', async () => {
    vscodeStub.window.__warnings.length = 0;
    const provider = { items: [] };

    const result = await openBeadFromFeed('MISSING-1', provider as any, async () => {
      throw new Error('should not be called');
    });

    assert.strictEqual(result, false);
    const warning = vscodeStub.window.__warnings[0];
    assert.ok(!warning || warning.includes('MISSING-1'), 'Warning should mention missing issue id when shown');
  });
});
