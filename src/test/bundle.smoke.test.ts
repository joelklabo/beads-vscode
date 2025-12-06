import assert from 'assert';
import path from 'path';
import fs from 'fs';
import Module from 'module';

const projectRoot = path.resolve(__dirname, '..', '..');
const distPath = path.join(projectRoot, 'dist', 'extension.js');

assert.ok(fs.existsSync(distPath), 'dist/extension.js is missing; run npm run bundle first');

const mockVscode = {
  l10n: { t: (value: string, ..._args: unknown[]) => value },
  workspace: {
    isTrusted: true,
    getConfiguration: () => ({ get: () => undefined }),
    onDidChangeConfiguration: () => ({ dispose: () => undefined }),
  },
  window: {
    showWarningMessage: () => undefined,
    createTreeView: () => ({ dispose: () => undefined }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => undefined }),
    executeCommand: () => undefined,
    registerTreeDataProvider: () => undefined,
  },
  TreeItem: class {
    label?: string;
    collapsibleState?: number;
    constructor(label?: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  },
  Uri: {
    parse: (v: string) => ({ toString: () => v }),
    file: (v: string) => ({ fsPath: v }),
  },
  EventEmitter: class<T> {
    private listeners: Array<(e: T) => unknown> = [];
    event = (listener: (e: T) => unknown) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };
    fire(data: T) {
      this.listeners.forEach((l) => l(data));
    }
    dispose() {
      this.listeners = [];
    }
  },
};

const mod = Module as unknown as { _load: (...args: any[]) => any };
const originalLoad = mod._load.bind(Module);
mod._load = function (request: string, parent: NodeModule | undefined, isMain: boolean) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalLoad(request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const extension = require(distPath);
assert.ok(extension.activate, 'Extension bundle must export activate');
assert.ok(typeof extension.activate === 'function', 'activate should be a function');

mod._load = originalLoad;
