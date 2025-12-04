import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_LOG_BYTES_LIMIT,
  limitLogPayload,
  redactLogContent
} from '../utils';
import { buildFeedbackBody } from '../feedback';

describe('Log redaction & capture', () => {
  it('redacts tokens, emails, and absolute paths', () => {
    const raw = [
      'token ghp_abcdefghijklmnopqrstuvwxyz1234567890',
      'contact: admin@example.com',
      'Bearer abcdefghijklmnopqrstuvwxyz',
      'Path: /Users/alice/projects/beads/.env',
      'Win: C\\\\Users\\\\Alice\\\\secrets.txt'
    ].join('\n');

    const redacted = redactLogContent(raw, { workspacePaths: ['/Users/alice/projects/beads'] });

    assert.ok(!/ghp_[A-Za-z0-9]{30,}/.test(redacted), 'GitHub token should be redacted');
    assert.ok(!redacted.includes('admin@example.com'), 'Email should be redacted');
    assert.ok(!/Bearer\s+abcdefghijklmnopqrstuvwxyz/.test(redacted), 'Bearer token should be redacted');
    assert.ok(!redacted.includes('/Users/alice/projects/beads'), 'Workspace path should be redacted');
    assert.ok(!redacted.includes('C\\Users\\Alice'), 'Windows path should be redacted');
    assert.ok(redacted.includes('<email>'), 'Redacted marker should be present');
  });

  it('caps log payload size safely', () => {
    const oversized = 'x'.repeat(DEFAULT_LOG_BYTES_LIMIT + 2048);
    const limited = limitLogPayload(oversized);

    assert.ok(limited.truncated, 'Payload should be truncated');
    assert.ok(limited.bytes <= DEFAULT_LOG_BYTES_LIMIT, 'Truncated payload must respect byte limit');
    assert.ok(limited.log.startsWith('[[truncated]]'));
  });

  it('skips logs by default when user has not opted in', async () => {
    const tmpFile = path.join(os.tmpdir(), `beads-log-${Date.now()}.log`);
    await fs.writeFile(tmpFile, 'sensitive data should stay local', 'utf8');

    try {
      const body = await buildFeedbackBody({ baseBody: 'Feedback body', logPath: tmpFile });

      assert.ok(body.includes('opt-out'), 'Body should mention opt-out');
      assert.ok(!body.includes('Sanitized logs'), 'Logs should not be attached');
    } finally {
      await fs.rm(tmpFile, { force: true });
    }
  });

  it('attaches sanitized tail when opted in', async () => {
    const tmpFile = path.join(os.tmpdir(), `beads-log-${Date.now()}-optin.log`);
    const lines = [
      'debug: start',
      'info: user john@example.com',
      'token ghp_abcdEFGHijklMNOPqrstUVWXyz1234567890',
      'path /Users/john/private/secret.txt',
      'debug: done'
    ];
    await fs.writeFile(tmpFile, lines.join('\n'), 'utf8');

    try {
      const body = await buildFeedbackBody({
        baseBody: 'Steps to reproduce',
        includeLogs: true,
        logPath: tmpFile,
        workspacePaths: ['/Users/john']
      });

      assert.ok(body.includes('Sanitized logs'), 'Logs section should be present');
      assert.ok(!body.includes('john@example.com'), 'Email should be redacted in attached logs');
      assert.ok(!body.includes('ghp_abcd'), 'Token should be redacted in attached logs');
      assert.ok(body.includes('<path>') || body.includes('<workspace>'), 'Paths should be redacted');
    } finally {
      await fs.rm(tmpFile, { force: true });
    }
  });
});
