import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import Module = require('module');

describe('activation configuration', () => {
  const pkgPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const events: string[] | undefined = pkg.activationEvents;

  it('defines explicit activation events (no wildcard)', () => {
    if (!events) {
      // VS Code will derive activation events from contributions; ensure no wildcard is present if defined
      assert.ok(true);
      return;
    }
    assert.ok(Array.isArray(events), 'activationEvents must be an array when present');
    assert.ok(!events.includes('*'), 'activationEvents must not include wildcard');
  });

  it('activates on core views and commands', () => {
    const contributes = pkg.contributes || {};
    const views = contributes.views?.beady ?? [];
    const viewIds = views.map((v: any) => v.id);
    assert.ok(viewIds.includes('beady.issuesView'), 'issues view contribution missing');
    assert.ok(viewIds.includes('activityFeed'), 'activity feed view contribution missing');

    const commands = (contributes.commands ?? []).map((c: any) => c.command);
    assert.ok(commands.includes('beady.refresh'), 'refresh command contribution missing');
    assert.ok(commands.includes('beady.createBead'), 'create command contribution missing');

    const chat = (contributes.chatParticipants ?? []).map((p: any) => p.id);
    assert.ok(chat.includes('beady.task-creator'), 'task-creator chat participant missing');
  });
});

describe('lazy activation lifecycle', () => {
  const createVscodeStub = (counters: { webview: number; tree: number; commands: number }) => {
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

    class ThemeIcon { constructor(public id: string, public color?: any) {} }
    class ThemeColor { constructor(public id: string) {} }
    class TreeItem { constructor(public label?: any, public collapsibleState: number = 0) {} }

    const createUri = (fsPath: string) => ({ fsPath, toString: () => fsPath });

    const Uri = {
      file: createUri,
      parse: createUri,
      joinPath: (...parts: any[]) => {
        const pathParts = parts.map((p: any) => (typeof p === 'string' ? p : p?.fsPath ?? ''));
        return createUri(pathParts.join('/'));
      },
    };

    const vscodeStub = {
      l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
      env: { language: 'en', openExternal: () => undefined },
      TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
      StatusBarAlignment: { Left: 1 },
      EventEmitter,
      MarkdownString,
      ThemeIcon,
      ThemeColor,
      TreeItem,
      Uri,
      RelativePattern: class {},
      workspace: {
        workspaceFolders: [] as any[],
        getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }),
        getWorkspaceFolder: () => ({ uri: { fsPath: '/tmp/project' } }),
        createFileSystemWatcher: () => ({
          onDidChange: () => ({ dispose: () => undefined }),
          onDidCreate: () => ({ dispose: () => undefined }),
          onDidDelete: () => ({ dispose: () => undefined }),
          dispose: () => undefined,
        }),
        onDidChangeConfiguration: () => ({ dispose: () => undefined }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined }),
      },
      window: {
        showInformationMessage: () => undefined,
        showErrorMessage: () => undefined,
        showWarningMessage: () => undefined,
        createTreeView: () => { counters.tree += 1; return { onDidDispose: () => ({ dispose: () => undefined }), dispose: () => undefined, message: undefined }; },
        registerWebviewViewProvider: () => { counters.webview += 1; return { dispose: () => undefined }; },
        createStatusBarItem: () => ({ show: () => undefined, hide: () => undefined, dispose: () => undefined }),
        createWebviewPanel: () => ({ webview: { html: '' }, onDidDispose: () => ({ dispose: () => undefined }), reveal: () => undefined, dispose: () => undefined }),
      },
      chat: { createChatParticipant: () => ({ dispose: () => undefined }) },
      lm: { selectChatModels: async () => [] },
      LanguageModelChatMessage: { User: (text: string) => ({ role: 'user', content: text }) },
      commands: {
        executeCommand: () => undefined,
        registerCommand: () => { counters.commands += 1; return { dispose: () => undefined }; },
      },
    } as any;

    return vscodeStub;
  };

  const createContextStub = () => {
    const store = new Map<string, any>();
    return {
      subscriptions: [] as any[],
      workspaceState: {
        get: (key: string) => store.get(key),
        update: (key: string, value: any) => {
          if (value === undefined) {
            store.delete(key);
          } else {
            store.set(key, value);
          }
          return Promise.resolve();
        },
      },
    };
  };

  let restoreLoad: any;

  afterEach(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
    Object.keys(require.cache).forEach((key) => { if (key.includes('vscode')) { delete require.cache[key]; } });
    delete require.cache[require.resolve('../../extension')];
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('activityFeedProvider') || key.includes('providers/beads/treeDataProvider') || key.includes('dependencyTreeProvider') || key.includes('providers/beads/webview') || key.includes('activation/commands')) {
        delete require.cache[key];
      }
    });
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('beads-7qx/out/')) {
        delete require.cache[key];
      }
    });
  });

  it('defers provider setup until activation', () => {
    const counters = { webview: 0, tree: 0, commands: 0 };
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;

    const stubModules: Record<string, any> = {
      '../../activityFeedProvider': { ActivityFeedTreeDataProvider: class { onHealthChanged() { return { dispose: () => undefined }; } }, ActivityEventItem: class {} },
      '../../providers/activityFeed/provider': { ActivityFeedTreeDataProvider: class { onHealthChanged() { return { dispose: () => undefined }; } } },
      '../../providers/beads/treeDataProvider': {
        BeadsTreeDataProvider: class {
          onDidChangeTreeData = () => ({ dispose: () => undefined });
          refresh() { return undefined; }
          setStatusBarItem() { return undefined; }
          setFeedbackEnabled() { return undefined; }
          setSortPickerEnabled() { return undefined; }
          syncQuickFilterContext() { return undefined; }
          getActiveWorkspaceId() { return undefined; }
          setDensity() { return undefined; }
          getDensity() { return 'default'; }
        },
        getStatusLabels: () => ({}),
        buildBeadDetailStrings: () => ({}),
      },
      '../../dependencyTreeProvider': { DependencyTreeProvider: class { refresh() { return undefined; } getRootId() { return undefined; } setRoot() { return undefined; } } },
      '../../providers/beads/webview': { BeadsWebviewProvider: class { static viewType = 'beady.issuesView'; constructor() { } } },
      '../../activation/commands': { registerCommands: () => { counters.commands += 1; } },
    };

    Object.entries(stubModules).forEach(([id, exportsObj]) => {
      const resolved = require.resolve(id, { paths: [__dirname] });
      require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj } as any;
    });

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return createVscodeStub(counters);
      }
      return restoreLoad(request, parent, isMain);
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../../extension');
    const context = createContextStub();

    assert.strictEqual(counters.webview, 0, 'webview registered before activation');
    assert.strictEqual(counters.tree, 0, 'tree views registered before activation');

    extension.activate(context as any);

    assert.strictEqual(counters.webview, 1, 'webview should register once');
    assert.strictEqual(counters.tree, 2, 'tree views should register once each');
    assert.ok(counters.commands > 0, 'commands should register on activation');
  });

  it('emits JSON results with budget and timing', async () => {
    process.env.BEADY_SKIP_PERF_MAIN = '1';
    require('ts-node/register/transpile-only');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beady-perf-test-'));
    const resultPath = path.join(tmpDir, 'activation.json');
    const distPath = path.join(tmpDir, 'extension.js');
    fs.writeFileSync(distPath, '// dist stub');

    const nowSteps = [0, 15, 30];
    const now = () => nowSteps.shift() ?? 30;
    const runCalls: any[] = [];

    const stubRunTests = async () => {
      runCalls.push(true);
      await fsPromises.mkdir(path.dirname(resultPath), { recursive: true });
      await fsPromises.writeFile(resultPath, JSON.stringify({ activationMs: 12, timestamp: 1234 }), 'utf8');
    };

    const scriptPath = path.resolve(__dirname, '../../../scripts/perf/measure-activation.ts');
    assert.ok(fs.existsSync(scriptPath), 'perf harness script missing');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { measureActivation } = require(scriptPath);

    const result = await measureActivation({
      runTestsImpl: stubRunTests as any,
      resultPath,
      budgetMs: 50,
      distPath,
      now,
    });

    const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    assert.strictEqual(parsed.activationMs, 12);
    assert.strictEqual(parsed.budgetMs, 50);
    assert.strictEqual(parsed.ok, true);
    assert.ok(typeof parsed.harnessMs === 'number' && parsed.harnessMs >= 15);
    assert.deepStrictEqual(result, parsed);
    assert.ok(runCalls.length === 1, 'runTests should be invoked once');

    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });
});
