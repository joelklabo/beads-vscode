/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Module = require('module');

describe('Activity feed resilience', () => {
  const tmpDir = path.join(__dirname, '..', '..', '..', 'tmp', 'activity-unavailable');
  let restoreLoad: any;

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, '.beads'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.beads', 'beads.db'), '');
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('activityFeed')) delete require.cache[key];
      if (key.includes('activityFeedProvider')) delete require.cache[key];
    });
  });

  afterEach(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('throws ActivityFeedUnavailable when sqlite3 binary is missing', async () => {
    const moduleAny = Module as any;
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'child_process') {
        return {
          execFile: (_cmd: string, _args: string[], _opts: any, cb: (err: any, stdout?: string) => void) => {
            cb({ code: 'ENOENT' });
          },
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    const { fetchEvents, ActivityFeedUnavailable } = require('../../activityFeed') as any;

    await assert.rejects(
      () => fetchEvents(tmpDir),
      (err: any) => err instanceof ActivityFeedUnavailable && err.code === 'NO_SQLITE'
    );
  });

  it('throws ActivityFeedUnavailable when database file is missing', async () => {
    const moduleAny = Module as any;
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'child_process') {
        return {
          execFile: (_cmd: string, _args: string[], _opts: any, cb: (err: any, stdout?: string) => void) => {
            cb(null, '{"count":0}');
          },
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    const { fetchEvents, ActivityFeedUnavailable } = require('../../activityFeed') as any;
    const missingRoot = path.join(tmpDir, 'missing');

    await assert.rejects(
      () => fetchEvents(missingRoot),
      (err: any) => err instanceof ActivityFeedUnavailable && err.code === 'NO_DB'
    );
  });

  it('surfaces status item when remote feed disabled', async () => {
    const moduleAny = Module as any;
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return {
          l10n: { t: (s: string) => s },
          env: { remoteName: 'ssh-remote' },
          EventEmitter: class {
            listeners: any[] = [];
            event = (fn: any) => { this.listeners.push(fn); return { dispose() {} }; };
            fire(v?: any) { this.listeners.forEach((fn) => fn(v)); }
          },
          window: {
            setStatusBarMessage: () => undefined,
            showErrorMessage: () => undefined,
            createTreeView: () => ({ selection: [], onDidChangeSelection: () => ({ dispose() {} }) }),
          },
          workspace: {
            workspaceFolders: [{ uri: { fsPath: tmpDir } }],
            getConfiguration: () => ({
              get: (key: string, fallback: any) => {
                if (key === 'activityFeed.allowRemote') return false;
                return fallback;
              },
            }),
            createFileSystemWatcher: () => ({
              onDidChange: () => ({ dispose() {} }),
              onDidCreate: () => ({ dispose() {} }),
              dispose: () => undefined,
            }),
          },
          ThemeIcon: class { constructor(public id: string) {} },
          ThemeColor: class { constructor(public id: string) {} },
          MarkdownString: class {
            constructor(public value = '') {}
            appendMarkdown(md: string) { this.value += md; }
          },
          TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
          TreeItem: class {
            constructor(public label: any, public collapsibleState: number) {}
          },
          Uri: { file: (fsPath: string) => ({ fsPath }), joinPath: (_base: any, ...paths: string[]) => ({ fsPath: paths.join('/') }) },
          RelativePattern: class {},
        } as any;
      }
      if (request.includes('activityFeed') && !request.includes('provider')) {
        // Use real module for ActivityFeedUnavailable type
        return restoreLoad(request, parent, isMain);
      }
      return restoreLoad(request, parent, isMain);
    };

    const ActivityFeedProvider = require('../../providers/activityFeed/provider').default as any;
    const contextStub = {
      subscriptions: [] as any[],
      workspaceState: { get: () => undefined, update: async () => undefined },
      extensionUri: { fsPath: '' },
    } as any;

    const provider = new ActivityFeedProvider(contextStub);
    const children = await provider.getChildren();
    assert.strictEqual(children.length, 1);
    assert.ok(String(children[0].label).toLowerCase().includes('remote'));
  });
});
