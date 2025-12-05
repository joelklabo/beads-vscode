import assert from 'node:assert';
import { test } from 'node:test';
import { createHeadlessActions } from '../src/hooks/actions';

test('headless actions inject --no-daemon for cli calls', async () => {
  const calls: Array<{ args: string[]; workspaceRoot?: string }> = [];
  const cli = {
    run: async (args: string[], options?: { workspaceRoot?: string }) => {
      calls.push({ args, workspaceRoot: options?.workspaceRoot });
    },
  };

  const actions = createHeadlessActions(cli, '/tmp/ws-headless');
  await actions.addDependency('bd-1', 'bd-2');
  await actions.updateStatus('bd-1', 'closed');

  assert.ok(calls.length === 2);
  for (const call of calls) {
    assert.ok(call.args[0] === '--no-daemon', 'must inject --no-daemon');
    assert.strictEqual(call.workspaceRoot, '/tmp/ws-headless');
  }
});

test('toggleFavorite uses label add/remove', async () => {
  const calls: string[][] = [];
  const cli = {
    run: async (args: string[]) => {
      calls.push(args);
    },
  };

  const actions = createHeadlessActions(cli, '/tmp/ws-headless');
  await actions.toggleFavorite('bd-3', 'fav');

  assert.ok(calls.length === 2, 'should remove then add');
  assert.deepStrictEqual(calls[0][2], 'bd-3');
  assert.ok(calls.every((args) => args[0] === '--no-daemon'));
});
