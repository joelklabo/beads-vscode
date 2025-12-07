import * as assert from 'assert';
import Module = require('module');

describe('cliService', () => {
  let restoreLoad: any;
  let formatBdError: (prefix: string, error: unknown, projectRoot?: string) => string;
  let resolveBeadId: (input: any) => string | undefined;

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;

    // Clear relevant caches
    Object.keys(require.cache).forEach(key => {
      if (key.includes('cliService') || key.includes('beads-vscode') || key.includes('@beads/core')) {
        delete require.cache[key];
      }
    });

    // Create vscode stub
    const t = (message: string, ...args: any[]) =>
      message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

    const vscodeStub = {
      l10n: { t },
      Uri: {
        file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
      },
      workspace: {
        isTrusted: true,
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
        getConfiguration: () => ({
          get: (key: string, fallback: any) => fallback,
        }),
        getWorkspaceFolder: () => ({ uri: { fsPath: '/test/workspace' } }),
      },
      window: {
        showWarningMessage: () => Promise.resolve(undefined),
      },
    } as any;

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    // Now import the module with stubs in place
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cliService = require('../../services/cliService');
    formatBdError = cliService.formatBdError;
    resolveBeadId = cliService.resolveBeadId;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  describe('formatBdError', () => {
    it('formats error with prefix', () => {
      const result = formatBdError('Command failed', new Error('something went wrong'));
      assert.ok(result.startsWith('Command failed'));
      assert.ok(result.includes('something went wrong'));
    });

    it('handles null error', () => {
      const result = formatBdError('Command failed', null);
      assert.strictEqual(result, 'Command failed');
    });

    it('handles undefined error', () => {
      const result = formatBdError('Command failed', undefined);
      assert.strictEqual(result, 'Command failed');
    });

    it('sanitizes workspace paths from error message', () => {
      const projectRoot = '/Users/secret/project';
      const error = new Error(`Failed at ${projectRoot}/file.ts`);
      const result = formatBdError('Command failed', error, projectRoot);
      assert.ok(!result.includes('/Users/secret/project'));
    });

    it('handles error objects with stderr', () => {
      const error = { message: 'failed', stderr: 'actual error' };
      const result = formatBdError('Command failed', error);
      assert.ok(result.includes('actual error'));
    });
  });

  describe('resolveBeadId', () => {
    it('extracts id from direct property', () => {
      const result = resolveBeadId({ id: 'beads-123' });
      assert.strictEqual(result, 'beads-123');
    });

    it('extracts id from bead.id', () => {
      const result = resolveBeadId({ bead: { id: 'beads-456' } });
      assert.strictEqual(result, 'beads-456');
    });

    it('extracts id from issueId', () => {
      const result = resolveBeadId({ issueId: 'beads-789' });
      assert.strictEqual(result, 'beads-789');
    });

    it('returns undefined for missing id', () => {
      const result = resolveBeadId({});
      assert.strictEqual(result, undefined);
    });

    it('returns undefined for null input', () => {
      const result = resolveBeadId(null);
      assert.strictEqual(result, undefined);
    });

    it('returns undefined for undefined input', () => {
      const result = resolveBeadId(undefined);
      assert.strictEqual(result, undefined);
    });

    it('sanitizes invalid ids', () => {
      // IDs with invalid characters should be sanitized to undefined
      const result = resolveBeadId({ id: 'beads-123\nrm -rf /' });
      assert.strictEqual(result, undefined);
    });

    it('preserves valid ids with allowed characters', () => {
      const result = resolveBeadId({ id: 'beads-abc_123.test' });
      assert.strictEqual(result, 'beads-abc_123.test');
    });

    it('rejects ids that are too long', () => {
      const longId = 'a'.repeat(100);
      const result = resolveBeadId({ id: longId });
      assert.strictEqual(result, undefined);
    });
  });
});
