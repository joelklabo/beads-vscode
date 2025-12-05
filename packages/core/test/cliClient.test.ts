import assert from 'node:assert';
import { test } from 'node:test';
import { buildSafeBdArgs, formatCliError } from '../src/cliClient';
import { sanitizeCliOutput } from '../src/security/sanitize';

test('buildSafeBdArgs injects --no-daemon and rejects newlines', () => {
  const args = buildSafeBdArgs(['list', '--json']);
  assert.deepStrictEqual(args[0], '--no-daemon');
  assert.ok(args.includes('--json'));

  assert.throws(() => buildSafeBdArgs(['list', 'bd-1\nrm -rf /']), /newlines/);
});

test('sanitizeCliOutput redacts secrets, workspace paths, and worktree ids', () => {
  const raw = 'ghp_abcdefghijklmnopqrstuvwxyz123456 /Users/me/worktrees/agent/task/.beads/db wt:agent/task';
  const sanitized = sanitizeCliOutput(raw, {
    workspacePaths: ['/Users/me/worktrees/agent/task'],
    worktreeId: 'wt:agent/task',
  });

  assert.ok(!sanitized.includes('ghp_abcd'), 'token should be redacted');
  assert.ok(!sanitized.includes('/Users/me/worktrees/agent/task'), 'workspace path should be redacted');
  assert.ok(!sanitized.includes('wt:agent/task'), 'worktree id should be redacted');
  assert.ok(sanitized.includes('<workspace>') || sanitized.includes('<worktree>'), 'placeholders should appear');
});

test('formatCliError prefixes with context and sanitized message', () => {
  const error = new Error('Failed in /tmp/worktrees/agent/task');
  const message = formatCliError('bd export', error, ['/tmp/worktrees/agent/task'], 'wt:agent/task');
  assert.ok(message.startsWith('bd export'), 'should keep prefix');
  assert.ok(!message.includes('/tmp/worktrees/agent/task'), 'should redact path');
});
