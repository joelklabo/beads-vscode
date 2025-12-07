import * as assert from 'assert';
import Module = require('module');

describe('runtimeEnvironment', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let resetRuntimeEnvironmentWarnings: () => void;
  let runWorktreeGuard: (projectRoot: string) => Promise<void>;
  let ensureWorkspaceTrusted: (workspaceFolder?: any) => Promise<void>;
  let warnIfDependencyEditingUnsupported: (workspaceFolder?: any) => Promise<void>;
  let fsAccessCalls: string[] = [];
  let execFileCalls: Array<{ cmd: string; args: string[]; opts: any }> = [];
  let warningMessages: string[] = [];

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;

    // Clear relevant caches
    Object.keys(require.cache).forEach(key => {
      if (key.includes('runtimeEnvironment') || key.includes('beads-vscode')) {
        delete require.cache[key];
      }
    });

    // Create vscode stub
    const t = (message: string, ...args: any[]) =>
      message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

    vscodeStub = {
      l10n: { t },
      workspace: {
        isTrusted: true,
        getConfiguration: () => ({
          get: (key: string, fallback: any) => {
            if (key === 'enableWorktreeGuard') return true;
            if (key === 'enableDependencyEditing') return false;
            if (key === 'commandPath') return 'bd';
            return fallback;
          },
        }),
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
      },
      window: {
        showWarningMessage: (msg: string) => {
          warningMessages.push(msg);
          return Promise.resolve(undefined);
        },
      },
    } as any;

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request === 'child_process') {
        return {
          execFile: (cmd: string, args: any, opts: any, cb: any) => {
            let callback = cb;
            let options = opts;
            if (typeof opts === 'function') {
              callback = opts;
              options = undefined;
            }
            execFileCalls.push({ cmd, args: args || [], opts: options });
            callback(null, '', '');
          },
        };
      }
      if (request === 'fs') {
        return {
          promises: {
            access: async (path: string) => {
              fsAccessCalls.push(path);
              // Simulate guard script exists
              if (path.includes('worktree-guard.sh')) {
                return;
              }
              throw new Error('ENOENT');
            },
          },
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    // Now import the module with stubs in place
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const runtimeEnv = require('../../services/runtimeEnvironment');
    resetRuntimeEnvironmentWarnings = runtimeEnv.resetRuntimeEnvironmentWarnings;
    runWorktreeGuard = runtimeEnv.runWorktreeGuard;
    ensureWorkspaceTrusted = runtimeEnv.ensureWorkspaceTrusted;
    warnIfDependencyEditingUnsupported = runtimeEnv.warnIfDependencyEditingUnsupported;
  });

  beforeEach(() => {
    fsAccessCalls = [];
    execFileCalls = [];
    warningMessages = [];
    resetRuntimeEnvironmentWarnings();
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  describe('runWorktreeGuard', () => {
    it('checks for guard script existence', async () => {
      await runWorktreeGuard('/test/project');
      assert.ok(fsAccessCalls.some(p => p.includes('worktree-guard.sh')));
    });

    it('executes guard script when it exists', async () => {
      await runWorktreeGuard('/test/project');
      assert.ok(execFileCalls.some(c => c.cmd.includes('worktree-guard.sh')));
    });

    it('does nothing when guard is disabled', async () => {
      // Override config to disable guard
      vscodeStub.workspace.getConfiguration = () => ({
        get: (key: string, fallback: any) => {
          if (key === 'enableWorktreeGuard') return false;
          return fallback;
        },
      });

      fsAccessCalls = [];
      execFileCalls = [];

      await runWorktreeGuard('/test/project');

      // Should show warning on first call
      assert.ok(warningMessages.some(m => m.includes('unsafe') || m.includes('disabled')));

      // Restore config
      vscodeStub.workspace.getConfiguration = () => ({
        get: (key: string, fallback: any) => {
          if (key === 'enableWorktreeGuard') return true;
          return fallback;
        },
      });
    });
  });

  describe('ensureWorkspaceTrusted', () => {
    it('passes when workspace is trusted', async () => {
      vscodeStub.workspace.isTrusted = true;
      await ensureWorkspaceTrusted();
      // Should not throw
    });

    it('passes in test environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      vscodeStub.workspace.isTrusted = false;

      await ensureWorkspaceTrusted();
      // Should not throw because test env

      process.env.NODE_ENV = originalEnv;
      vscodeStub.workspace.isTrusted = true;
    });
  });

  describe('warnIfDependencyEditingUnsupported', () => {
    it('does nothing when dependency editing is disabled', async () => {
      vscodeStub.workspace.getConfiguration = () => ({
        get: (key: string, fallback: any) => {
          if (key === 'enableDependencyEditing') return false;
          return fallback;
        },
      });

      warningMessages = [];
      await warnIfDependencyEditingUnsupported();
      assert.strictEqual(warningMessages.length, 0);
    });
  });

  describe('resetRuntimeEnvironmentWarnings', () => {
    it('resets warning state so they can be shown again', () => {
      // This is a test hook to reset module state
      resetRuntimeEnvironmentWarnings();
      // Just verify it doesn't throw
    });
  });
});
