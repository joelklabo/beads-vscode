/**
 * BD CLI Integration Tests
 *
 * These tests can run standalone without VSCode test environment.
 * Run with: npm run test:bd-cli
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { BdCliClient, DEFAULT_CLI_POLICY } from '@beads/core';

const execFileAsync = promisify(execFile);

async function findBdCommand(): Promise<string> {
  try {
    await execFileAsync('bd', ['version']);
    return 'bd';
  } catch {
    // Fall through to try common locations
  }

  const commonPaths = [
    '/opt/homebrew/bin/bd',
    '/usr/local/bin/bd',
    path.join(os.homedir(), '.local/bin/bd'),
    path.join(os.homedir(), 'go/bin/bd'),
  ];

  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      continue;
    }
  }

  throw new Error('bd command not found. Please install beads CLI: https://github.com/steveyegge/beads');
}

describe('BD CLI Standalone Tests', function () {
  let testWorkspace: string;
  let bdCommand: string;
  let client: BdCliClient;

  // Increase timeout for setup
  this.timeout(30000);

  before(async function () {
    bdCommand = await findBdCommand();
    testWorkspace = path.join(os.tmpdir(), `beady-test-${Date.now()}`);
    await fs.mkdir(testWorkspace, { recursive: true });

    // Initialize bd in the test workspace
    await execFileAsync(bdCommand, ['init', '--quiet'], { cwd: testWorkspace });

    client = new BdCliClient({ commandPath: bdCommand, cwd: testWorkspace, policy: DEFAULT_CLI_POLICY });
  });

  after(async function () {
    if (testWorkspace) {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    }
  });

  const listIssues = async () => {
    const { stdout } = await client.list(['--json']);
    return JSON.parse(stdout);
  };

  const createIssue = async (title: string, extraArgs: string[] = []) => {
    const { stdout } = await client.run(['create', title, ...extraArgs]);
    const match = stdout.match(/Created issue: ([\w-]+)/);
    return match ? match[1] : undefined;
  };

  it('should list issues and return valid JSON', async function () {
    const issues = await listIssues();
    assert.ok(issues === null || Array.isArray(issues), 'bd list should return null or array');
  });

  it('should create a new issue', async function () {
    await createIssue('Test issue', ['--priority', '1']);
    const issues = await listIssues();
    assert.ok(Array.isArray(issues));
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].title, 'Test issue');
    assert.strictEqual(issues[0].priority, 1);
    assert.strictEqual(issues[0].status, 'open');
  });

  it('should update issue status', async function () {
    const issueId = await createIssue('Status test issue');
    assert.ok(issueId, 'Should extract issue ID from create output');

    await client.update(issueId!, ['--status', 'in_progress']);

    const issues = await listIssues();
    const updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.strictEqual(updatedIssue.status, 'in_progress');
  });

  it('should add a label to issue', async function () {
    const issueId = await createIssue('Label test issue');
    assert.ok(issueId);

    await client.label('add', issueId!, 'test-label');

    const issues = await listIssues();
    const labeledIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(labeledIssue);
    assert.ok(Array.isArray(labeledIssue.labels));
    assert.ok(labeledIssue.labels.includes('test-label'));
  });

  it('should remove a label from issue', async function () {
    const issueId = await createIssue('Label remove test');
    assert.ok(issueId);

    await client.label('add', issueId!, 'temp-label');
    await client.label('remove', issueId!, 'temp-label');

    const issues = await listIssues();
    const updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.ok(!updatedIssue.labels || !updatedIssue.labels.includes('temp-label'));
  });

  it('should close an issue', async function () {
    const issueId = await createIssue('Close test issue');
    assert.ok(issueId);

    await client.run(['close', issueId!]);

    const issues = await listIssues();
    const closedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(closedIssue);
    assert.strictEqual(closedIssue.status, 'closed');
  });

  it('should return statistics', async function () {
    const { stdout } = await client.run(['stats']);
    assert.ok(stdout.length > 0, 'bd stats should return output');
    assert.ok(stdout.includes('total') || stdout.includes('Total'), 'Output should mention total');
  });
});
