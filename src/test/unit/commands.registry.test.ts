import * as assert from 'assert';
import Module = require('module');

describe('commands/registry', () => {
  let restoreLoad: any;
  let CommandRegistry: any;
  let registeredCommands: Map<string, any>;

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;

    // Clear relevant caches
    Object.keys(require.cache).forEach(key => {
      if (key.includes('commands') || key.includes('beads-vscode')) {
        delete require.cache[key];
      }
    });

    registeredCommands = new Map();

    const vscodeStub = {
      l10n: { t: (s: string) => s },
      commands: {
        registerCommand: (id: string, handler: any) => {
          registeredCommands.set(id, handler);
          return { dispose: () => registeredCommands.delete(id) };
        },
      },
    } as any;

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const registry = require('../../commands/registry');
    CommandRegistry = registry.CommandRegistry;
  });

  beforeEach(() => {
    registeredCommands.clear();
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  describe('CommandRegistry', () => {
    it('registers a single command', () => {
      const registry = new CommandRegistry();
      const handler = () => {};

      registry.register('command', handler);

      assert.strictEqual(registeredCommands.size, 1);
      assert.ok(registeredCommands.has('beady.command'));
    });

    it('registers multiple commands at once', () => {
      const registry = new CommandRegistry();

      registry.registerAll([
        { id: 'beady.cmd1', handler: () => {} },
        { id: 'beady.cmd2', handler: () => {} },
        { id: 'beady.cmd3', handler: () => {} },
      ]);

      assert.strictEqual(registeredCommands.size, 3);
    });

    it('returns disposables for cleanup', () => {
      const registry = new CommandRegistry();
      registry.register('disposable', () => {});

      const disposables = registry.getDisposables();
      assert.ok(Array.isArray(disposables));
      assert.ok(disposables.length > 0);
    });

    it('disposes all commands when disposed', () => {
      const registry = new CommandRegistry();
      registry.register('dispose1', () => {});
      registry.register('dispose2', () => {});

      assert.strictEqual(registeredCommands.size, 2);

      // Dispose all
      registry.dispose();

      assert.strictEqual(registeredCommands.size, 0);
    });
  });
});
