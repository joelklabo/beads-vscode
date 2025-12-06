import * as assert from 'assert';
import Module = require('module');

// Minimal VS Code stub so we can import extension classes
function createVscodeStub() {
  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    public event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data?: T): void {
      this.listeners.forEach(listener => listener(data as T));
    }
    dispose(): void {
      this.listeners = [];
    }
  }

  class MarkdownString {
    value = '';
    isTrusted = false;
    supportHtml = false;
    appendMarkdown(md: string): void {
      this.value += md;
    }
  }

  class ThemeIcon {
    constructor(public id: string, public color?: any) {}
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  class TreeItem {
    public label?: any;
    public collapsibleState: number;
    public iconPath?: any;
    public description?: string;
    public tooltip?: any;
    public contextValue?: string;
    public command?: any;

    constructor(label?: any, collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  const vscodeStub = {
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    TreeItem,
    ThemeIcon,
    ThemeColor,
    MarkdownString,
    EventEmitter,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    workspace: {
      workspaceFolders: [] as any[],
      getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }),
    },
    window: {
      showInformationMessage: () => undefined,
      showErrorMessage: () => undefined,
      createTreeView: () => ({})
    },
    commands: { executeCommand: () => undefined },
    StatusBarAlignment: { Left: 1 },
    RelativePattern: class {},
    workspaceState: new Map<string, any>(),
  } as any;

  return vscodeStub;
}

function createContextStub() {
  const store = new Map<string, any>();
  return {
    subscriptions: [] as any[],
    workspaceState: {
      get: (key: string) => store.get(key),
      update: (key: string, value: any) => {
        if (value === undefined) {
          store.delete(key);
        } else {
          store.set(key, value);
        }
        return Promise.resolve();
      },
    },
  };
}

describe('Extension tree items', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let BeadTreeItem: any;
  let EpicTreeItem: any;
  let BeadsTreeDataProvider: any;

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub();
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../../extension');
    BeadTreeItem = extension.BeadTreeItem;
    EpicTreeItem = extension.EpicTreeItem;
    BeadsTreeDataProvider = extension.BeadsTreeDataProvider;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('maps issue types to the expected icons', () => {
    const expectations: Record<string, string> = {
      epic: 'rocket',
      task: 'tasklist',
      bug: 'bug',
      feature: 'sparkle',
      chore: 'wrench',
      spike: 'telescope',
    };

    Object.entries(expectations).forEach(([issueType, expectedIcon]) => {
      const item = new BeadTreeItem({
        id: `${issueType}-1`,
        title: 'sample',
        issueType,
        status: 'open',
      });
      assert.strictEqual(item.iconPath.id, expectedIcon);
    });
  });

  it('renders assignee badge and status text in bead descriptions', () => {
    const bead = new BeadTreeItem({
      id: 'task-1',
      title: 'Badge check',
      issueType: 'task',
      status: 'blocked',
      assignee: 'Ada Lovelace',
    });

    const description = String(bead.description);
    assert.ok(description.includes('Ada Lovelace'));
    assert.ok(/[🔵🟢🟣🟠🔴🟡⚫⚪]/u.test(description));
    assert.ok(description.toLowerCase().includes('blocked'));
  });

  it('falls back to unassigned badge when assignee missing', () => {
    const bead = new BeadTreeItem({
      id: 'task-2',
      title: 'No owner',
      issueType: 'task',
      status: 'open',
    });

    const description = String(bead.description);
    assert.ok(description.includes('Unassigned'));
    assert.ok(description.includes('⚪'));
  });

  it('sanitizes assignee text in descriptions and tooltips', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const bead = new BeadTreeItem({
      id: 'task-evil',
      title: 'Malicious assignee',
      issueType: 'task',
      status: 'open',
      assignee: malicious,
    });

    const description = String(bead.description);
    assert.ok(!description.includes('<'), 'description should not contain raw HTML');

    const tooltip = (bead.tooltip && (bead.tooltip as any).value) || '';
    assert.ok(!tooltip.includes('<img'), 'tooltip should escape assignee HTML');
    assert.ok(!tooltip.includes(malicious), 'tooltip should not include raw assignee HTML');
  });

  it('provides expandable detail items for beads', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    (provider as any).items = [
      {
        id: 'task-1',
        title: 'Inspect expandable row',
        issueType: 'task',
        status: 'open',
        assignee: 'Ada Lovelace',
        tags: ['backend', 'infra'],
        updatedAt: new Date().toISOString(),
        priority: 2,
      }
    ];

    const roots = await provider.getChildren();
    const bead = roots.find((n: any) => n.contextValue === 'bead');

    assert.ok(bead, 'bead tree item should exist');
    assert.strictEqual(bead.collapsibleState, vscodeStub.TreeItemCollapsibleState.Collapsed);

    const details = await provider.getChildren(bead);
    const detailLabels = details.map((d: any) => d.label as string);
    const detailDescriptions = details.map((d: any) => d.description as string);

    assert.ok(detailDescriptions.some((d: string) => (d || '').toLowerCase().includes('status: open')));
    assert.ok(detailLabels.some((l: string) => (l || '').toLowerCase().includes('labels')));
    assert.ok(detailLabels.some((l: string) => (l || '').toLowerCase().includes('updated')));

    provider.dispose();
  });

  it('creates an EpicTreeItem with children summary', () => {
    const epic = { id: 'epic-1', title: 'Test Epic', issueType: 'epic', status: 'open' };
    const children = [
      { id: 'child-1', title: 'Child 1', issueType: 'task', status: 'open', parentId: 'epic-1' }
    ];

    const item = new EpicTreeItem(epic, children, false);

    assert.strictEqual(item.label, 'Test Epic');
    assert.strictEqual(item.description, 'epic-1 · 1 item');
    assert.strictEqual(item.children.length, 1);
    assert.strictEqual(item.contextValue, 'epicItem');
    assert.strictEqual(item.collapsibleState, vscodeStub.TreeItemCollapsibleState.Expanded);
  });

  it('getChildren returns epic children in epic sort mode', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    (provider as any).items = [
      { id: 'epic-1', title: 'Parent Epic', issueType: 'epic', status: 'open' },
      { id: 'task-1', title: 'Child task', issueType: 'task', status: 'open', parentId: 'epic-1' },
      { id: 'bug-1', title: 'Child bug', issueType: 'bug', status: 'open', parentId: 'epic-1' },
    ];
    (provider as any).sortMode = 'epic';

    const roots = await provider.getChildren();
    const epicSection = roots.find((item: any) => item.contextValue === 'epicStatusSection');
    assert.ok(epicSection, 'Epic status section should exist');

    const epicNodes = await provider.getChildren(epicSection);
    const epicNode = epicNodes.find((node: any) => node instanceof EpicTreeItem);
    assert.ok(epicNode, 'Epic node should exist');

    const children = await provider.getChildren(epicNode);
    const ids = children.map((child: any) => child.bead.id);
    assert.deepStrictEqual(ids, ['bug-1', 'task-1']);

    provider.dispose();
  });

  it('sorts by assignee placing named items first and unassigned last', () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    const items = [
      { id: 'task-3', title: 'Gamma', assignee: '' },
      { id: 'task-1', title: 'Alpha', assignee: 'Ada' },
      { id: 'task-2', title: 'Beta', assignee: 'ada' },
      { id: 'task-4', title: 'Delta' },
    ];

    const sorted = (provider as any).sortByAssignee(items);
    assert.deepStrictEqual(sorted.map((i: any) => i.id), ['task-1', 'task-2', 'task-3', 'task-4']);

    provider.dispose();
  });

  it('epic view warning excludes closed tasks even if stale', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    const now = Date.now();
    (provider as any).items = [
      { id: 'task-stale', title: 'Stale task', issueType: 'task', status: 'in_progress', inProgressSince: new Date(now - 60 * 60 * 1000).toISOString() },
      { id: 'task-closed-stale', title: 'Closed stale task', issueType: 'task', status: 'closed', inProgressSince: new Date(now - 60 * 60 * 1000).toISOString() },
    ];
    (provider as any).sortMode = 'epic';

    const roots = await provider.getChildren();
    const warning = roots.find((r: any) => r.contextValue === 'warningSection');
    const warningIds = warning ? warning.beads.map((b: any) => b.id) : [];
    assert.deepStrictEqual(warningIds, ['task-stale']);

    provider.dispose();
  });

  it('stale warning excludes closed epics, both empty and with children', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    const now = Date.now();
    (provider as any).items = [
      { id: 'epic-open-empty', title: 'Open empty epic', issueType: 'epic', status: 'open' },
      { id: 'epic-closed-empty', title: 'Closed empty epic', issueType: 'epic', status: 'closed' },
      { id: 'epic-closed-has-children', title: 'Closed with kids', issueType: 'epic', status: 'closed' },
      { id: 'child-open', title: 'Open child', issueType: 'task', status: 'open', parentId: 'epic-closed-has-children' },
      { id: 'task-stale', title: 'Stale task', issueType: 'task', status: 'in_progress', inProgressSince: new Date(now - 60 * 60 * 1000).toISOString() },
    ];
    (provider as any).sortMode = 'epic';

    const roots = await provider.getChildren();
    const warning = roots.find((r: any) => r.contextValue === 'warningSection');
    const warningIds = warning ? warning.beads.map((b: any) => b.id).sort() : [];
    assert.deepStrictEqual(warningIds, ['epic-open-empty', 'task-stale']);

    const closedSection = roots.find((r: any) => r.contextValue === 'epicStatusSection' && r.status === 'closed') as any;
    const closedEpics = await provider.getChildren(closedSection);
    const closedIds = closedEpics.map((n: any) => n.epic.id).sort();
    assert.deepStrictEqual(closedIds, ['epic-closed-empty', 'epic-closed-has-children']);

    const closedWithChildren = closedEpics.find((n: any) => n.epic.id === 'epic-closed-has-children');
    const children = await provider.getChildren(closedWithChildren);
    assert.deepStrictEqual(children.map((c: any) => c.bead.id), ['child-open']);

    provider.dispose();
  });

  it('status root sections order warning → in_progress → open → blocked → closed with default collapses', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    const now = Date.now();
    (provider as any).items = [
      { id: 'task-stale', title: 'Stale task', issueType: 'task', status: 'in_progress', inProgressSince: new Date(now - 60 * 60 * 1000).toISOString() },
      { id: 'task-progress', title: 'Working task', issueType: 'task', status: 'in_progress', inProgressSince: new Date(now - 5 * 60 * 1000).toISOString() },
      { id: 'task-open', title: 'Open task', issueType: 'task', status: 'open' },
      { id: 'task-blocked', title: 'Blocked task', issueType: 'task', status: 'blocked' },
      { id: 'task-closed', title: 'Closed task', issueType: 'task', status: 'closed' },
    ];
    (provider as any).sortMode = 'status';

    const roots = await provider.getChildren();
    const labels = roots.map((r: any) => r.contextValue === 'warningSection' ? 'warning' : r.status);
    assert.deepStrictEqual(labels, ['warning', 'in_progress', 'open', 'blocked', 'closed']);

    const warning = roots[0] as any;
    assert.strictEqual(warning.contextValue, 'warningSection');
    assert.strictEqual(warning.collapsibleState, vscodeStub.TreeItemCollapsibleState.Expanded);

    const statusSections = roots.filter((r: any) => r.contextValue === 'statusSection');
    statusSections.forEach((section: any) => {
      assert.strictEqual(section.collapsibleState, vscodeStub.TreeItemCollapsibleState.Collapsed);
    });

    provider.dispose();
  });

  it('epic root sections order warning → in_progress → open → blocked → closed with empty epics in warning', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    const now = Date.now();
    (provider as any).items = [
      { id: 'epic-empty-open', title: 'Open empty', issueType: 'epic', status: 'open' },
      { id: 'epic-empty', title: 'No children', issueType: 'epic', status: 'closed' },
      { id: 'epic-open', title: 'Open epic', issueType: 'epic', status: 'open' },
      { id: 'epic-progress', title: 'Working epic', issueType: 'epic', status: 'in_progress' },
      { id: 'epic-blocked', title: 'Blocked epic', issueType: 'epic', status: 'blocked' },
      { id: 'task-stale', title: 'Stale task', issueType: 'task', status: 'in_progress', inProgressSince: new Date(now - 60 * 60 * 1000).toISOString(), parentId: 'epic-progress' },
      { id: 'task-open', title: 'Child open', issueType: 'task', status: 'open', parentId: 'epic-open' },
      { id: 'task-blocked', title: 'Child blocked', issueType: 'task', status: 'blocked', parentId: 'epic-blocked' },
    ];
    (provider as any).sortMode = 'epic';

    const roots = await provider.getChildren();
    const orderLabels = roots.map((r: any) => r.contextValue === 'warningSection' ? 'warning' : (r.status || r.contextValue));
    assert.deepStrictEqual(orderLabels, ['warning', 'in_progress', 'open', 'blocked', 'closed']);

    const warning = roots.find((r: any) => r.contextValue === 'warningSection');
    assert.ok(warning);
    const warningIds = warning!.beads.map((b: any) => b.id).sort();
    assert.deepStrictEqual(warningIds, ['epic-empty-open', 'task-stale']);

    const progressSection = roots.find((r: any) => r.contextValue === 'epicStatusSection' && r.status === 'in_progress') as any;
    const progressChildren = await provider.getChildren(progressSection);
    assert.ok(progressChildren.some((n: any) => n.epic.id === 'epic-progress'), 'in_progress section should include non-empty epics only');

    const closedSection = roots.find((r: any) => r.contextValue === 'epicStatusSection' && r.status === 'closed') as any;
    const closedChildren = await provider.getChildren(closedSection);
    assert.ok(closedChildren.some((n: any) => n.epic.id === 'epic-empty'), 'closed empty epics should stay in closed section, not warning');

    provider.dispose();
  });

  it('warning section excludes closed items in status view', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    const now = Date.now();
    (provider as any).items = [
      { id: 'task-stale', title: 'Stale task', issueType: 'task', status: 'in_progress', inProgressSince: new Date(now - 60 * 60 * 1000).toISOString() },
      { id: 'task-closed-staleish', title: 'Closed with timer', issueType: 'task', status: 'closed', inProgressSince: new Date(now - 60 * 60 * 1000).toISOString() },
    ];
    (provider as any).sortMode = 'status';

    const roots = await provider.getChildren();
    const warning = roots.find((r: any) => r.contextValue === 'warningSection');
    const warningIds = warning ? warning.beads.map((b: any) => b.id) : [];
    assert.deepStrictEqual(warningIds, ['task-stale']);

    const closedSection = roots.find((r: any) => r.contextValue === 'statusSection' && r.status === 'closed') as any;
    const closedItems = await provider.getChildren(closedSection);
    assert.ok(closedItems.some((n: any) => n.bead.id === 'task-closed-staleish'), 'closed items stay in closed section');

    provider.dispose();
  });
});
