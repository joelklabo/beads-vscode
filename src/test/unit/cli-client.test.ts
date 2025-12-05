import * as assert from 'assert';
import { BdCliClient, BdCliError, BdCliErrorKind, DEFAULT_CLI_POLICY, buildSafeBdArgs } from '@beads/core';

describe('BdCliClient', () => {
  it('retries transient errors before succeeding', async () => {
    const calls: any[] = [];
    const client = new BdCliClient({
      commandPath: 'bd',
      execImplementation: async (_cmd, _args) => {
        calls.push(_args);
        if (calls.length === 1) {
          const err: any = new Error('reset');
          err.code = 'ECONNRESET';
          throw err;
        }
        return { stdout: 'ok', stderr: '' };
      },
      policy: { ...DEFAULT_CLI_POLICY, retryCount: 1, retryBackoffMs: 0 },
    });

    const result = await client.run(['list']);
    assert.strictEqual(result.stdout, 'ok');
    assert.strictEqual(calls.length, 2);
  });

  it('surfaces timeout as BdCliError with sanitized message', async () => {
    const workspacePath = '/tmp/workspace-test';
    const client = new BdCliClient({
      commandPath: 'bd',
      workspacePaths: [workspacePath],
      execImplementation: async () => {
        const err: any = new Error(`timed out in ${workspacePath}`);
        err.code = 'ETIMEDOUT';
        throw err;
      },
      policy: { ...DEFAULT_CLI_POLICY, retryCount: 0, timeoutMs: 1, retryBackoffMs: 0 },
    });

    try {
      await client.run(['list']);
      assert.fail('expected timeout');
    } catch (error) {
      assert.ok(error instanceof BdCliError);
      const cliError = error as BdCliError;
      assert.strictEqual(cliError.kind, 'timeout');
      assert.ok(!cliError.message.includes(workspacePath));
    }
  });

  it('flags offline when elapsed exceeds threshold', async () => {
    const client = new BdCliClient({
      commandPath: 'bd',
      execImplementation: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        const err: any = new Error('still failing');
        err.code = 'ETIMEDOUT';
        throw err;
      },
      policy: { timeoutMs: 1, retryCount: 1, retryBackoffMs: 0, offlineThresholdMs: 1 },
    });

    try {
      await client.run(['list']);
      assert.fail('expected offline error');
    } catch (error) {
      assert.ok(error instanceof BdCliError);
      const cliError = error as BdCliError;
      assert.strictEqual(cliError.kind, 'offline');
    }
  });
  it('rejects arguments containing newlines', () => {
    assert.throws(() => buildSafeBdArgs(['list', 'bd-1\nrm -rf /']), /newlines/);
  });

});
