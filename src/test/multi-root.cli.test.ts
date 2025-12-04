/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

describe('Multi-root bd command resolution', () => {
  let restoreLoad: any;
  let runBdCommand: any;
  const execCalls: Array<{ command: string; args: string[]; options: any }> = [];
  let workspaceFolders: any[];

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;

    workspaceFolders = [
      { uri: { fsPath: '/workspace/one' }, name: 'one', index: 0 },
      { uri: { fsPath: '/workspace/two' }, name: 'two', index: 1 },
    ];

    const fsStub = {
      promises: {
        access: async () => Promise.resolve(),
      }
    };

    const childProcessStub = {
      execFile: (command: string, args: string[], options: any, callback: any) => {
        execCalls.push({ command, args, options });
        if (typeof callback === 'function') {
          callback(null, { stdout: '', stderr: '' });
        }
      }
    };

    class TreeItem {
      public label?: any;
      public description?: string;
      public iconPath?: any;
      public tooltip?: any;
      public contextValue?: string;
      constructor(label?: any, public collapsibleState: number = 0) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    }

    class ThemeIcon {
      constructor(public id: string, public color?: any) {}
    }

    class ThemeColor {
      constructor(public id: string) {}
    }

    class MarkdownString {
      value = '';
      isTrusted = false;
      supportHtml = false;
      appendMarkdown(md: string): void {
        this.value += md;
      }
    }

    const t = (message: string, ...args: any[]) =>
      message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

    const vscodeStub = {
      l10n: { t },
      env: { language: 'en', openExternal: () => undefined },
      workspace: {
        workspaceFolders,
        getWorkspaceFolder: (uri: any) => workspaceFolders.find((wf) => uri.fsPath.startsWith(wf.uri.fsPath)),
        getConfiguration: (_section: string, workspaceFolder?: any) => ({
          get: (key: string, fallback: any) => {
            if (key === 'commandPath') {
              return workspaceFolder?.name === 'two' ? '/bin/ls' : '/bin/echo';
            }
            if (key === 'enableWorktreeGuard') {
              return false;
            }
            return fallback;
          }
        })
      },
      window: {
        showWarningMessage: () => undefined,
        showErrorMessage: () => undefined,
      },
      TreeItem,
      ThemeIcon,
      ThemeColor,
      MarkdownString,
      TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
      Uri: {
        file: (fsPath: string) => ({ fsPath })
      }
    } as any;

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request === 'child_process') {
        return childProcessStub;
      }
      if (request === 'fs') {
        return fsStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../utils/cli')];
    delete require.cache[require.resolve('../extension')];
    runBdCommand = require('../extension').runBdCommand;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('uses workspace-specific command path and cwd', async () => {
    execCalls.length = 0;
    const execOverride = async ({ commandPath, args, cwd }: any) => {
      execCalls.push({ command: commandPath, args, options: { cwd } });
      return { stdout: '', stderr: '' };
    };

    await runBdCommand(['list'], '/workspace/two', { workspaceFolder: workspaceFolders[1], execOverride });

    const lastCall = execCalls[execCalls.length - 1];
    assert.strictEqual(lastCall.command, '/bin/ls');
    assert.strictEqual(lastCall.options?.cwd, '/workspace/two');
  });

  it('rejects when project root is outside open workspaces', async () => {
    execCalls.length = 0;
    let error: any;
    try {
      await runBdCommand(['list'], '/outside/root');
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'should throw for out-of-workspace root');
  });
});
