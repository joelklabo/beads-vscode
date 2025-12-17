import * as path from 'path';

export function stripNoDaemon(args: any[]): any[] {
  if (!Array.isArray(args) || args.length === 0) {
    return args;
  }
  return args[0] === '--no-daemon' ? args.slice(1) : args;
}

export function resetVscodeRequireCache(): void {
  if (typeof require === 'undefined') {
    return;
  }

  try {
    const resolved = require.resolve('vscode');
    delete require.cache[resolved];
  } catch {
    // ignore when vscode is not resolvable (unit test runtime)
  }

  if (require.cache['vscode']) {
    delete require.cache['vscode'];
  }
}

export function resetBeadyRequireCache(): void {
  if (typeof require === 'undefined') {
    return;
  }

  const projectRoot = path.resolve(__dirname, '../../..');
  const outDir = path.join(projectRoot, 'out') + path.sep;
  const outTestDir = path.join(outDir, 'test') + path.sep;
  const packagesDir = path.join(projectRoot, 'packages') + path.sep;
  const packagesOutFragment = `${path.sep}out${path.sep}`;
  const packagesOutTestFragment = `${path.sep}out${path.sep}test${path.sep}`;

  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(outDir) && !key.startsWith(outTestDir)) {
      delete require.cache[key];
      continue;
    }

    if (key.startsWith(packagesDir) && key.includes(packagesOutFragment) && !key.includes(packagesOutTestFragment)) {
      delete require.cache[key];
    }
  }
}

export interface VscodeStubOptions {
  quickPickResult?: any;
  config?: Record<string, any>;
}

export function createContextStub() {
  const store = new Map<string, any>();
  return {
    subscriptions: [] as any[],
    workspaceState: {
      get: (key: string) => store.get(key),
      update: async (key: string, value: any) => {
        if (value === undefined) {
          store.delete(key);
        } else {
          store.set(key, value);
        }
      },
    },
  };
}

export function createVscodeStub(options: VscodeStubOptions = {}) {
  const info: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const commandCalls: Array<{ command: string; args: any[] }> = [];

  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    public event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data?: T): void { this.listeners.forEach(listener => listener(data as T)); }
    dispose(): void { this.listeners = []; }
  }

  class TreeItem {
    public label?: any;
    public description?: string;
    public collapsibleState: number;
    public tooltip?: any;
    public contextValue?: string;
    public command?: any;
    constructor(label?: any, collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class MarkdownString {
    value = '';
    isTrusted = false;
    supportHtml = false;
    appendMarkdown(md: string): void { this.value += md; }
  }

  class ThemeIcon {
    constructor(public id: string, public color?: any) {}
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  class QuickPick<T = any> {
    public items: T[] = [];
    public activeItems: T[] = [];
    public selectedItems: T[] = [];
    public matchOnDetail = false;
    public matchOnDescription = false;
    public placeholder?: string;
    public title?: string;

    private acceptEmitter = new EventEmitter<void>();
    private hideEmitter = new EventEmitter<void>();

    constructor(private readonly api: any) {}

    onDidAccept(listener: () => void) {
      return this.acceptEmitter.event(listener);
    }

    onDidHide(listener: () => void) {
      return this.hideEmitter.event(listener);
    }

    show(): void {
      if (this.api._nextQuickPick !== undefined) {
        const result = this.api._nextQuickPick;
        this.api._nextQuickPick = undefined;
        this.selectedItems = [result];
        this.activeItems = [result];
      } else if (!this.selectedItems.length) {
        const candidates = this.items as any[];
        const firstPreset = candidates.find((item) => item?.preset !== undefined);
        const firstNonSeparator = candidates.find((item) => item?.kind !== this.api.QuickPickItemKind?.Separator);
        const fallback = firstPreset ?? firstNonSeparator ?? candidates[0];
        if (fallback) {
          this.selectedItems = [fallback];
          this.activeItems = [fallback];
        }
      }

      const first = this.selectedItems[0] as any;
      if (!first || first.kind === this.api.QuickPickItemKind?.Separator) {
        this.hide();
        return;
      }
      this.acceptEmitter.fire();
    }

    hide(): void {
      this.hideEmitter.fire();
    }

    dispose(): void {
      this.acceptEmitter.dispose();
      this.hideEmitter.dispose();
    }
  }

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  const vscodeStub: any = {
    _nextQuickPick: options.quickPickResult,
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    TreeItem,
    MarkdownString,
    ThemeIcon,
    ThemeColor,
    EventEmitter,
    QuickPickItemKind: { Separator: -1 },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    StatusBarAlignment: { Left: 1 },
    RelativePattern: class {},
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (...parts: any[]) => ({ fsPath: parts.map((p) => (typeof p === 'string' ? p : p.fsPath)).join('/') })
    },
    window: {
      _quickPickItems: [] as any[],
      showQuickPick: async (items: any[]) => {
        vscodeStub.window._quickPickItems = items;
        if (vscodeStub._nextQuickPick !== undefined) {
          const result = vscodeStub._nextQuickPick;
          vscodeStub._nextQuickPick = undefined;
          return result;
        }
        return items?.find((item: any) => item?.preset) ?? items?.[0];
      },
      createQuickPick: () => new QuickPick(vscodeStub),
      showInformationMessage: (message: string) => { info.push(message); return Promise.resolve(undefined); },
      showWarningMessage: (message: string) => { warnings.push(message); return Promise.resolve(undefined); },
      showErrorMessage: (message: string) => { errors.push(message); return Promise.resolve(undefined); },
      createTreeView: () => ({ description: undefined, badge: undefined }),
      createStatusBarItem: () => ({ text: '', tooltip: '', command: undefined, show() {}, hide() {}, dispose() {} }),
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration: () => ({
        get: (key: string, fallback: any) => {
          if (options.config && key in options.config) {
            return (options.config as any)[key];
          }
          if (key === 'quickFilters.enabled') {
            return true;
          }
          if (key === 'staleThresholdMinutes') {
            return 10;
          }
          if (key === 'enableDependencyEditing') {
            return false;
          }
          return fallback;
        },
      }),
      getWorkspaceFolder: () => undefined,
      createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), onDidDelete: () => ({ dispose() {} }), dispose() {} }),
    },
    commands: {
      _calls: commandCalls,
      executeCommand: (command: string, ...args: any[]) => { commandCalls.push({ command, args }); return Promise.resolve(); },
    },
    _info: info,
    _warnings: warnings,
    _errors: errors,
  };

  return vscodeStub;
}
