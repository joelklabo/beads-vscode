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

  class EventEmitter<T = any> {
    private listeners: Array<(e: T) => void> = [];
    public readonly event = (listener: (e: T) => any) => {
      this.listeners.push(listener);
      return { dispose() {} };
    };
    fire(data?: T): void {
      this.listeners.forEach((l) => l(data as T));
    }
    dispose(): void {
      this.listeners = [];
    }
  }

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  return {
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    EventEmitter,
    TreeItem,
    MarkdownString,
    ThemeIcon,
    ThemeColor,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/tmp/project' } }] as any[],
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
      setStatusBarMessage: () => undefined,
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
    Uri: { joinPath: () => ({ fsPath: '' }), file: () => ({ fsPath: '' }) },
  } as any;
}

async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 200): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async (): Promise<void> => {
      try {
        const result = await condition();
        if (result) {
          resolve();
          return;
        }
      } catch {
        // ignore and keep waiting
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error('timeout'));
        return;
      }

      setTimeout(tick, 10);
    };

    void tick();
  });
}

describe('Activity feed auto-refresh', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let fetchCallCount = 0;

  beforeEach(() => {
    fetchCallCount = 0;
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub();
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('activityFeed')) {
        delete require.cache[key];
      }
    });

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request === '../../worktree' || request.includes('worktree')) {
        return { currentWorktreeId: () => 'wt-1' } as any;
      }
      if ((request.endsWith('activityFeed') || request.includes('activityFeed.js')) && !request.includes('activityFeedProvider')) {
        let shouldFail = true;
        return {
          fetchEvents: async (_root: string, _options: any) => {
            fetchCallCount++;
            if (shouldFail) {
              shouldFail = false;
              throw new Error('db locked');
            }
            return {
              events: [
                {
                  id: 1,
                  issueId: 'BD-1',
                  issueTitle: 'BD-1 Title',
                  eventType: 'created',
                  actor: 'user',
                  oldValue: null,
                  newValue: null,
                  comment: 'created BD-1',
                  createdAt: new Date(),
                  description: 'Issue created',
                  iconName: 'sparkle',
                  colorClass: 'event-created',
                },
              ],
              totalCount: 150,
              hasMore: true,
            };
          },
          groupEventsByTime: (events: any[]) => {
            const map = new Map<string, any[]>();
            map.set('Today', events);
            return map;
          },
          formatRelativeTimeDetailed: () => 'just now',
          normalizeEventType: (x: any) => x,
        } as any;
      }
      return restoreLoad(request, parent, isMain);
    };
  });

  afterEach(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('activityFeed')) {
        delete require.cache[key];
      }
    });
  });

  it('retries after a failed refresh and resumes updates', async () => {
    const contextStub = {
      subscriptions: [] as any[],
      workspaceState: { get: () => undefined, update: async () => undefined },
      extensionUri: { fsPath: '' },
    } as any;

    const ActivityFeedTreeDataProvider = require('../../activityFeedProvider').ActivityFeedTreeDataProvider;
    const provider = new ActivityFeedTreeDataProvider(contextStub, {
      baseIntervalMs: 5,
      maxIntervalMs: 20,
      idleBackoffStepMs: 5,
    });

    await waitFor(() => fetchCallCount >= 2, 400);

    const roots = await provider.getChildren();
    const timeGroup = roots.find((item: any) => item.contextValue === 'timeGroup');
    assert.ok(timeGroup, 'expected time group after retry');
    const children = await provider.getChildren(timeGroup);
    assert.strictEqual(children.length, 1, 'event should render after retry');

    provider.dispose();
    assert.ok(fetchCallCount >= 2, 'auto-refresh should retry after a failure');
  });
});
