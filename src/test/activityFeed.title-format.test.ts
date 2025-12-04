/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

function createVscodeStub() {
  class TreeItem {
    public label?: any;
    public description?: string;
    public tooltip?: any;
    public iconPath?: any;
    public contextValue?: string;
    public command?: any;
    constructor(label?: any, public collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
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

  return {
    TreeItem,
    MarkdownString,
    ThemeIcon,
    ThemeColor,
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
      showWarningMessage: () => undefined,
      showErrorMessage: () => undefined,
      showInformationMessage: () => undefined,
      createTreeView: () => ({ selection: [], onDidChangeSelection: () => ({ dispose() {} }) }),
      createStatusBarItem: () => ({ show() {}, hide() {}, text: '', dispose() {} }),
      createWebviewPanel: () => ({
        webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }) },
        onDidDispose: () => ({ dispose() {} })
      }),
    },
    commands: {
      registerCommand: () => ({ dispose: () => undefined }),
      executeCommand: () => undefined,
    },
    StatusBarAlignment: { Left: 1 },
    RelativePattern: class {},
  } as any;
}

describe('Activity feed title formatting', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let ActivityEventItem: any;

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

    ActivityEventItem = require('../activityFeedProvider').ActivityEventItem;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('keeps labels clean and moves id/snippet to description', () => {
    const event = {
      id: 1,
      issueId: 'BD-101',
      issueTitle: 'BD-101 Fix login loop',
      eventType: 'created',
      actor: 'user',
      oldValue: null,
      newValue: null,
      comment: null,
      createdAt: new Date(),
      description: 'Issue BD-101 created',
      iconName: 'sparkle',
      colorClass: 'event-created',
    };

    const item = new ActivityEventItem(event);

    assert.strictEqual(item.label, 'Fix login loop');
    assert.ok(item.description?.includes('BD-101'));
    assert.ok(item.description?.includes('Issue created'));
    const idMatches = item.description?.match(/BD-101/g) || [];
    assert.strictEqual(idMatches.length, 1, 'ID should appear once in description');
  });
});
