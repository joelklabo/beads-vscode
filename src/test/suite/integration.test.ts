import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { normalizeBead, isStale, getStaleInfo, BeadItemData } from '../../utils';

const execFileAsync = promisify(execFile);

suite('BD CLI Integration Test Suite', () => {
  let testWorkspace: string;
  let bdCommand: string;

  suiteSetup(async function() {
    // Set a longer timeout for setup
    this.timeout(30000);

    // Find bd command
    bdCommand = await findBdCommand();
    console.log(`Using bd command: ${bdCommand}`);

    // Create temporary test workspace
    testWorkspace = path.join(os.tmpdir(), `beads-vscode-test-${Date.now()}`);
    await fs.mkdir(testWorkspace, { recursive: true });
    console.log(`Created test workspace: ${testWorkspace}`);

    // Initialize bd in the test workspace
    try {
      await execFileAsync(bdCommand, ['init', '--quiet'], { cwd: testWorkspace });
      console.log('Initialized bd in test workspace');
    } catch (error: any) {
      console.error('Failed to initialize bd:', error.message);
      throw error;
    }
  });

  suiteTeardown(async () => {
    // Clean up test workspace
    if (testWorkspace) {
      try {
        await fs.rm(testWorkspace, { recursive: true, force: true });
        console.log('Cleaned up test workspace');
      } catch (error) {
        console.warn('Failed to clean up test workspace:', error);
      }
    }
  });

  test('bd list should return empty array initially', async () => {
    const { stdout } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(stdout);
    assert.ok(Array.isArray(issues));
    assert.strictEqual(issues.length, 0);
  });

  test('bd create should create a new issue', async () => {
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Test issue', '--priority', '1'],
      { cwd: testWorkspace }
    );

    assert.ok(createOutput.includes('Created'));

    // Verify issue was created
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].title, 'Test issue');
    assert.strictEqual(issues[0].priority, 1);
    assert.strictEqual(issues[0].status, 'open');
  });

  test('bd update should change issue status', async () => {
    // Create an issue first
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Status test issue'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    assert.ok(issueIdMatch, 'Should extract issue ID from create output');
    const issueId = issueIdMatch![1];

    // Update status
    await execFileAsync(bdCommand, ['update', issueId, '--status', 'in_progress'], { cwd: testWorkspace });

    // Verify status changed
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.strictEqual(updatedIssue.status, 'in_progress');
  });

  test('bd label add should add a label to issue', async () => {
    // Create an issue first
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Label test issue'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    // Add label
    await execFileAsync(bdCommand, ['label', 'add', issueId, 'test-label'], { cwd: testWorkspace });

    // Verify label was added
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const labeledIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(labeledIssue);
    assert.ok(Array.isArray(labeledIssue.labels));
    assert.ok(labeledIssue.labels.includes('test-label'));
  });

  test('bd label remove should remove a label from issue', async () => {
    // Create an issue and add a label
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Label remove test'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    await execFileAsync(bdCommand, ['label', 'add', issueId, 'temp-label'], { cwd: testWorkspace });

    // Remove label
    await execFileAsync(bdCommand, ['label', 'remove', issueId, 'temp-label'], { cwd: testWorkspace });

    // Verify label was removed
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.ok(!updatedIssue.labels || !updatedIssue.labels.includes('temp-label'));
  });

  test('bd close should close an issue', async () => {
    // Create an issue
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Close test issue'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    // Close the issue
    await execFileAsync(bdCommand, ['close', issueId], { cwd: testWorkspace });

    // Verify issue was closed
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const closedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(closedIssue);
    assert.strictEqual(closedIssue.status, 'closed');
  });

  test('bd stats should return statistics', async () => {
    const { stdout } = await execFileAsync(bdCommand, ['stats'], { cwd: testWorkspace });
    // bd stats doesn't have --json flag, so we just verify it runs successfully
    assert.ok(stdout.length > 0, 'bd stats should return output');
    assert.ok(stdout.includes('total') || stdout.includes('Total'), 'Output should mention total');
  });

  test('stale task detection should work correctly', async () => {
    // Create an issue and set to in_progress
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Stale test issue'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    assert.ok(issueIdMatch, 'Should extract issue ID from create output');
    const issueId = issueIdMatch![1];

    // Update status to in_progress
    await execFileAsync(bdCommand, ['update', issueId, '--status', 'in_progress'], { cwd: testWorkspace });

    // Verify status is in_progress
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.strictEqual(updatedIssue.status, 'in_progress');
    
    // The issue should have updated_at timestamp which can be used for stale detection
    // Note: Actual stale detection is handled by the extension using the isStale helper
    // This test verifies the CLI data supports the feature
    assert.ok(updatedIssue.updated_at, 'Issue should have updated_at timestamp for stale detection');
  });
});

async function findBdCommand(): Promise<string> {
  // Try 'bd' in PATH first
  try {
    await execFileAsync('bd', ['version']);
    return 'bd';
  } catch {
    // Fall through to try common locations
  }

  // Try common installation locations
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

  throw new Error('bd command not found. Please install beads CLI');
}

suite('Stale Task Detection Integration Tests', () => {
  let testWorkspace: string;
  let bdCommand: string;

  suiteSetup(async function() {
    this.timeout(30000);
    bdCommand = await findBdCommand();
    testWorkspace = path.join(os.tmpdir(), `beads-stale-test-${Date.now()}`);
    await fs.mkdir(testWorkspace, { recursive: true });
    await execFileAsync(bdCommand, ['init', '--quiet'], { cwd: testWorkspace });
  });

  suiteTeardown(async () => {
    if (testWorkspace) {
      try {
        await fs.rm(testWorkspace, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }
  });

  test('new in_progress task should not be stale', async () => {
    // Create an issue and set to in_progress
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Stale test 1'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    await execFileAsync(bdCommand, ['update', issueId, '--status', 'in_progress'], { cwd: testWorkspace });

    // Get the issue data
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const issue = issues.find((i: any) => i.id === issueId);

    // Normalize and check staleness
    const bead = normalizeBead(issue, 0);
    
    // Just created, so should not be stale (threshold is 10 minutes default = 0.167 hours)
    assert.strictEqual(isStale(bead, 0.167), false, 'Newly created in_progress task should not be stale');
  });

  test('normalizeBead should set inProgressSince for in_progress tasks', async () => {
    // Create an issue and set to in_progress
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Stale test 2'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    await execFileAsync(bdCommand, ['update', issueId, '--status', 'in_progress'], { cwd: testWorkspace });

    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const issue = issues.find((i: any) => i.id === issueId);

    const bead = normalizeBead(issue, 0);
    
    assert.strictEqual(bead.status, 'in_progress');
    assert.ok(bead.inProgressSince, 'inProgressSince should be set for in_progress tasks');
    assert.ok(bead.updatedAt, 'updatedAt should be set');
    assert.strictEqual(bead.inProgressSince, bead.updatedAt, 'inProgressSince should equal updatedAt');
  });

  test('open task should not have inProgressSince', async () => {
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Open task test'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const issue = issues.find((i: any) => i.id === issueId);

    const bead = normalizeBead(issue, 0);
    
    assert.strictEqual(bead.status, 'open');
    assert.strictEqual(bead.inProgressSince, undefined, 'Open tasks should not have inProgressSince');
    assert.strictEqual(isStale(bead, 0.001), false, 'Open tasks should never be stale');
  });

  test('closed task should not have inProgressSince', async () => {
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Closed task test'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    await execFileAsync(bdCommand, ['close', issueId], { cwd: testWorkspace });

    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const issue = issues.find((i: any) => i.id === issueId);

    const bead = normalizeBead(issue, 0);
    
    assert.strictEqual(bead.status, 'closed');
    assert.strictEqual(bead.inProgressSince, undefined, 'Closed tasks should not have inProgressSince');
    assert.strictEqual(isStale(bead, 0.001), false, 'Closed tasks should never be stale');
  });

  test('getStaleInfo should return valid info for in_progress tasks', async () => {
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Stale info test'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    await execFileAsync(bdCommand, ['update', issueId, '--status', 'in_progress'], { cwd: testWorkspace });

    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const issue = issues.find((i: any) => i.id === issueId);

    const bead = normalizeBead(issue, 0);
    const info = getStaleInfo(bead);
    
    assert.ok(info, 'getStaleInfo should return info for in_progress tasks');
    assert.ok(typeof info.hoursInProgress === 'number', 'hoursInProgress should be a number');
    assert.ok(info.hoursInProgress >= 0, 'hoursInProgress should be non-negative');
    assert.ok(typeof info.formattedTime === 'string', 'formattedTime should be a string');
    assert.ok(info.formattedTime.length > 0, 'formattedTime should not be empty');
  });

  test('simulated stale task detection with mock timestamp', () => {
    // Create a mock bead with an old timestamp to simulate a stale task
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const mockBead: BeadItemData = {
      id: 'mock-stale-task',
      idKey: 'mock-stale-task',
      title: 'Mock Stale Task',
      status: 'in_progress',
      inProgressSince: twoHoursAgo,
      updatedAt: twoHoursAgo,
      raw: {}
    };

    // With 1 hour threshold, should be stale
    assert.strictEqual(isStale(mockBead, 1), true, 'Task in progress for 2 hours should be stale with 1 hour threshold');

    // With 3 hour threshold, should not be stale
    assert.strictEqual(isStale(mockBead, 3), false, 'Task in progress for 2 hours should not be stale with 3 hour threshold');

    // getStaleInfo should show approximately 2 hours
    const info = getStaleInfo(mockBead);
    assert.ok(info, 'getStaleInfo should return info');
    assert.ok(info.hoursInProgress >= 1.9 && info.hoursInProgress <= 2.1, 'Should report approximately 2 hours');
    assert.strictEqual(info.formattedTime, '2h', 'Should format as 2h');
  });

  test('warning section logic: filtering stale items', () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const items: BeadItemData[] = [
      { id: 'task-1', idKey: 'task-1', title: 'Recent', status: 'in_progress', inProgressSince: thirtyMinsAgo, raw: {} },
      { id: 'task-2', idKey: 'task-2', title: 'Stale', status: 'in_progress', inProgressSince: twoHoursAgo, raw: {} },
      { id: 'task-3', idKey: 'task-3', title: 'Open', status: 'open', raw: {} },
      { id: 'task-4', idKey: 'task-4', title: 'Closed', status: 'closed', raw: {} },
    ];

    // With 1 hour threshold (in hours)
    const thresholdHours = 1;
    const staleItems = items.filter(item => isStale(item, thresholdHours));
    
    assert.strictEqual(staleItems.length, 1, 'Should find 1 stale item');
    assert.strictEqual(staleItems[0].id, 'task-2', 'Stale item should be task-2');
  });
});
