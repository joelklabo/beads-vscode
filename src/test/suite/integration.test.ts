import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { BeadItemData, normalizeBead } from '@beads/core';
import { getStaleInfo, isStale } from '../../utils/stale';
import { BeadsTreeDataProvider, EpicTreeItem, UngroupedSectionItem, BeadTreeItem, openBeadFromFeed } from '../../extension';
import { EpicStatusSectionItem } from '../../providers/beads/items';
import { findBdCommand } from '../../providers/beads/store';

const execFileAsync = promisify(execFile);

suite('BD CLI Integration Test Suite', function() {
  // CLI calls and bd setup take a bit longer inside VS Code's test host
  this.timeout(60000);
  let testWorkspace: string;
  let bdCommand: string;

  suiteSetup(async function() {
    // Set a longer timeout for setup
    this.timeout(30000);

    // Find bd command
    bdCommand = await findBdCommand('bd');
    console.log(`Using bd command: ${bdCommand}`);

    // Create temporary test workspace
    testWorkspace = path.join(os.tmpdir(), `beady-test-${Date.now()}`);
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

  test('bd update should set and clear assignee', async () => {
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Assignee test issue'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    await execFileAsync(bdCommand, ['update', issueId, '--assignee', 'Integration User'], { cwd: testWorkspace });
    let { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    let issues = JSON.parse(listOutput);
    let updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.strictEqual(updatedIssue.assignee, 'Integration User');

    await execFileAsync(bdCommand, ['update', issueId, '--assignee', ''], { cwd: testWorkspace });
    ({ stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace }));
    issues = JSON.parse(listOutput);
    updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.ok(!updatedIssue.assignee, 'assignee should clear when empty');
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

  test('epic view groups empty epics into warning section with correct order', async () => {
    const context: any = {
      subscriptions: [],
      workspaceState: {
        get: (_key: string) => undefined,
        update: () => Promise.resolve(),
      },
    };

    const provider = new BeadsTreeDataProvider(context);
    (provider as any).sortMode = 'epic';
    const now = Date.now();
    (provider as any).items = [
      { id: 'epic-empty', title: 'No children', issueType: 'epic', status: 'open' },
      { id: 'epic-open', title: 'Open epic', issueType: 'epic', status: 'open' },
      { id: 'epic-inprog', title: 'Working', issueType: 'epic', status: 'in_progress' },
      { id: 'task-stale', title: 'Stale', issueType: 'task', status: 'in_progress', inProgressSince: new Date(now - 60 * 60 * 1000).toISOString(), parentId: 'epic-inprog' },
      { id: 'task-child', title: 'Child', issueType: 'task', status: 'open', parentId: 'epic-open' },
    ];

    const roots = await provider.getChildren();
    const labels = roots.map((r: any) => r.contextValue === 'warningSection' ? 'warning' : r.status);
    assert.deepStrictEqual(labels, ['warning', 'in_progress', 'open']);

    const warning = roots.find((r: any) => r.contextValue === 'warningSection') as any;
    const warningIds = warning.beads.map((b: any) => b.id).sort();
    assert.deepStrictEqual(warningIds, ['epic-empty', 'task-stale']);

    const inprogSection = roots.find((r: any) => r instanceof EpicStatusSectionItem && r.status === 'in_progress') as any;
    const inprogChildren = await provider.getChildren(inprogSection);
    assert.ok(inprogChildren.some((node: any) => node instanceof EpicTreeItem && node.epic && node.epic.id === 'epic-inprog'));

    const openSection = roots.find((r: any) => r instanceof EpicStatusSectionItem && r.status === 'open') as any;
    const openChildren = await provider.getChildren(openSection);
    assert.ok(openChildren.some((node: any) => node instanceof EpicTreeItem && node.epic && node.epic.id === 'epic-open'));
  });
});

class TestMemento implements vscode.Memento {
  private store = new Map<string, any>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.store.has(key) ? this.store.get(key) : defaultValue;
  }

  update(key: string, value: any): Thenable<void> {
    if (value === undefined) {
      this.store.delete(key);
    } else {
      this.store.set(key, value);
    }
    return Promise.resolve();
  }

  keys(): readonly string[] {
    return Array.from(this.store.keys());
  }
}

function createTestContext(basePath: string): vscode.ExtensionContext {
  const memento = new TestMemento();
  const secretsEmitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
  const secrets: vscode.SecretStorage = {
    get: async (key: string) => memento.get(key),
    store: async (key: string, value: string) => {
      await memento.update(key, value);
      secretsEmitter.fire({ key });
    },
    delete: async (key: string) => {
      await memento.update(key, undefined);
      secretsEmitter.fire({ key });
    },
    keys: async () => Array.from(memento.keys()),
    onDidChange: secretsEmitter.event,
  };

  const envCollection: vscode.EnvironmentVariableCollection = {
    persistent: true,
    description: undefined,
    get: () => undefined,
    replace: () => undefined,
    append: () => undefined,
    prepend: () => undefined,
    delete: () => undefined,
    clear: () => undefined,
    forEach: () => undefined,
    [Symbol.iterator]: () => [][Symbol.iterator](),
  };

  const extension = vscode.extensions.getExtension('klabo.beady') as vscode.Extension<any> | undefined;

  return {
    subscriptions: [],
    workspaceState: memento,
    globalState: Object.assign(memento, { setKeysForSync: (_keys: readonly string[]) => undefined }),
    secrets,
    extensionUri: vscode.Uri.file(basePath),
    extensionPath: basePath,
    environmentVariableCollection: envCollection,
    storageUri: vscode.Uri.file(path.join(basePath, 'storage')),
    globalStorageUri: vscode.Uri.file(path.join(basePath, 'global')),
    logUri: vscode.Uri.file(path.join(basePath, 'log')),
    storagePath: path.join(basePath, 'storage'),
    globalStoragePath: path.join(basePath, 'global'),
    logPath: path.join(basePath, 'log'),
    extensionMode: vscode.ExtensionMode.Test,
    asAbsolutePath: (rel: string) => path.join(basePath, rel),
    extension: extension ?? ({ id: 'beady-test' } as unknown as vscode.Extension<any>),
  } as unknown as vscode.ExtensionContext;
}

suite('Stale Task Detection Integration Tests', function() {
  this.timeout(40000);
  let testWorkspace: string;
  let bdCommand: string;

  suiteSetup(async function() {
    this.timeout(30000);
    bdCommand = await findBdCommand('bd');
    testWorkspace = path.join(os.tmpdir(), `beady-stale-test-${Date.now()}`);
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

suite('Epic tree integration', () => {
  const workspaceRoot = path.join(os.tmpdir(), `beads-epic-tree-${Date.now()}`);
  const now = new Date().toISOString();
  const sampleItems: BeadItemData[] = [
    { id: 'epic-1', title: 'Epic Folder', issueType: 'epic', status: 'open', updatedAt: now },
    { id: 'task-1', title: 'Child Task', issueType: 'task', status: 'open', parentId: 'epic-1', updatedAt: now },
    { id: 'feature-2', title: 'Child Feature', issueType: 'feature', status: 'in_progress', parentId: 'epic-1', updatedAt: now },
    { id: 'orphan-1', title: 'Orphan Task', issueType: 'task', status: 'open', updatedAt: now },
  ];

  let provider: BeadsTreeDataProvider | undefined;

  suiteSetup(async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  teardown(() => {
    provider?.dispose();
    provider = undefined;
  });

  suiteTeardown(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  function createEpicProvider() {
    const context = createTestContext(workspaceRoot);
    const p = new BeadsTreeDataProvider(context);
    (p as any).items = sampleItems;
    (p as any).sortMode = 'epic';
    return { provider: p, context };
  }

  test('epic mode exposes epics as expandable nodes', async () => {
    const setup = createEpicProvider();
    provider = setup.provider;

    const roots = await provider.getChildren();
    const epicSection = roots.find(item => item instanceof EpicStatusSectionItem) as EpicStatusSectionItem | undefined;

    assert.ok(epicSection, 'Epic status section should be present in epic sort mode');
    const epicNodes = await provider.getChildren(epicSection) as EpicTreeItem[];
    const epicNode = epicNodes[0];

    assert.ok(epicNode, 'Epic node should be present in epic status section');
    assert.strictEqual(epicNode.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.strictEqual(epicNode.contextValue, 'epicItem');
  });

  test('epic children render under their parent epic', async () => {
    const setup = createEpicProvider();
    provider = setup.provider;

    const roots = await provider.getChildren();
    const epicSection = roots.find(item => item instanceof EpicStatusSectionItem) as EpicStatusSectionItem;
    const epicNodes = await provider.getChildren(epicSection) as EpicTreeItem[];
    const epicNode = epicNodes[0];
    const childNodes = await provider.getChildren(epicNode) as BeadTreeItem[];

    const childIds = childNodes.map(child => child.bead.id);
    assert.deepStrictEqual(childIds, ['feature-2', 'task-1']);
  });

  test('collapse and expand updates state and persists', async () => {
    const { provider: p, context } = createEpicProvider();
    provider = p;

    const roots = await provider.getChildren();
    const epicSection = roots.find(item => item instanceof EpicStatusSectionItem) as EpicStatusSectionItem;
    const epicNodes = await provider.getChildren(epicSection) as EpicTreeItem[];
    const epicNode = epicNodes[0];

    provider.handleCollapseChange(epicNode, true);
    assert.strictEqual(epicNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    const stored = context.workspaceState.get<Record<string, boolean>>('beady.collapsedEpics', {});
    assert.deepStrictEqual(stored, { 'epic-1': true });

    provider.handleCollapseChange(epicNode, false);
    assert.strictEqual(epicNode.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    const storedAfterExpand = context.workspaceState.get<Record<string, boolean>>('beady.collapsedEpics', {});
    assert.deepStrictEqual(storedAfterExpand, {});
  });

  test('ungrouped section collects items without epics', async () => {
    const setup = createEpicProvider();
    provider = setup.provider;

    const roots = await provider.getChildren();
    const ungrouped = roots.find(item => item instanceof UngroupedSectionItem) as UngroupedSectionItem | undefined;

    assert.ok(ungrouped, 'Ungrouped section should be present');
    const ungroupedChildren = await provider.getChildren(ungrouped) as BeadTreeItem[];
    assert.deepStrictEqual(ungroupedChildren.map(child => child.bead.id), ['orphan-1']);
    assert.strictEqual(ungrouped.description, '1 item');
  });

  test('detail webview renders dependency status labels without crashing', async () => {
    const context: any = {
      subscriptions: [],
      workspaceState: {
        get: (_key: string) => undefined,
        update: () => Promise.resolve(),
      },
    };

    const provider = new BeadsTreeDataProvider(context);
    (provider as any).items = [
      {
        id: 'issue-1',
        title: 'Parent with dependency',
        issueType: 'task',
        status: 'blocked',
        raw: {
          dependencies: [
            { depends_on_id: 'issue-2', dep_type: 'blocks' },
          ],
        },
      },
      {
        id: 'issue-2',
        title: 'Upstream issue',
        issueType: 'task',
        status: 'in_progress',
        raw: { dependencies: [] },
      },
    ];

    const opened = await openBeadFromFeed('issue-1', provider);
    assert.strictEqual(opened, true, 'detail webview should open');
    const panel = (provider as any)['openPanels']?.get('issue-1');
    assert.ok(panel, 'webview panel should be registered');
    const html = String(panel?.webview?.html || '');
    assert.ok(html.includes('In Progress'), 'dependency status label should be present');
    panel?.dispose();
  });

});
