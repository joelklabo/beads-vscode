import * as vscode from 'vscode';
import { BeadItemData, buildDependencyTrees } from './utils';

export type DependencyDirection = 'upstream' | 'downstream';

class DependencyTreeNodeItem extends vscode.TreeItem {
  public readonly sourceId: string;
  public readonly targetId: string;
  public readonly direction: DependencyDirection;
  public readonly children: DependencyTreeNodeItem[];

  constructor(
    public readonly node: any,
    parentId: string,
    direction: DependencyDirection,
    children: DependencyTreeNodeItem[],
    bead?: BeadItemData
  ) {
    super(
      node.title ? `${node.id} - ${node.title}` : node.id,
      children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    this.direction = direction;
    this.children = children;
    this.sourceId = direction === 'upstream' ? parentId : node.id;
    this.targetId = direction === 'upstream' ? node.id : parentId;
    this.contextValue = direction === 'upstream' ? 'dependencyNodeUpstream' : 'dependencyNodeDownstream';
    const relation = direction === 'upstream' ? vscode.l10n.t('blocks this issue') : vscode.l10n.t('blocked by this issue');
    this.description = `${node.type}${node.missing ? ' · missing' : ''} · ${relation}`;
    this.tooltip = node.missing
      ? `${node.id} (${node.type}) - ${relation}`
      : `${node.id} (${node.type})${bead?.status ? ` · ${bead.status}` : ''} · ${relation}`;
    this.accessibilityInformation = {
      label: `${node.id} ${node.title ?? ''} ${relation}${bead?.status ? ` · ${bead.status}` : ''}`.trim(),
    };
    this.iconPath = new vscode.ThemeIcon(direction === 'upstream' ? 'arrow-up' : 'arrow-down');

    if (bead) {
      this.command = {
        command: 'beady.openBead',
        title: 'Open Bead',
        arguments: [bead],
      };
    }
  }
}

class DependencyGroupItem extends vscode.TreeItem {
  constructor(public readonly direction: DependencyDirection, public readonly children: DependencyTreeNodeItem[]) {
    super(
      direction === 'upstream' ? vscode.l10n.t('Upstream (depends on)') : vscode.l10n.t('Downstream (blocked by)'),
      children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = direction === 'upstream' ? 'dependencyGroupUpstream' : 'dependencyGroupDownstream';
    this.tooltip = direction === 'upstream'
      ? vscode.l10n.t('Issues this item depends on')
      : vscode.l10n.t('Issues blocked by this item');
    this.iconPath = new vscode.ThemeIcon(direction === 'upstream' ? 'arrow-up' : 'arrow-down');
  }
}

class EmptyDependencyItem extends vscode.TreeItem {
  constructor() {
    super(vscode.l10n.t('Select an issue to view dependencies'), vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'dependencyEmpty';
  }
}

export class DependencyTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private rootId: string | undefined;
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly getItems: () => BeadItemData[] | undefined) {}

  setRoot(id: string | undefined): void {
    this.rootId = id;
    this.refresh();
  }

  getRootId(): string | undefined {
    return this.rootId;
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    const items = this.getItems() ?? [];
    if (!this.rootId || items.length === 0) {
      return [new EmptyDependencyItem()];
    }

    const root = items.find((i) => i.id === this.rootId);
    if (!root) {
      return [new EmptyDependencyItem()];
    }

    if (!element) {
      const trees = buildDependencyTrees(items, this.rootId);
      const upstreamNodes = this.buildNodes(trees.upstream, root.id, 'upstream', items);
      const downstreamNodes = this.buildNodes(trees.downstream, root.id, 'downstream', items);
      const groups: vscode.TreeItem[] = [];
      groups.push(new DependencyGroupItem('upstream', upstreamNodes));
      groups.push(new DependencyGroupItem('downstream', downstreamNodes));
      return groups;
    }

    if (element instanceof DependencyGroupItem) {
      return element.children;
    }

    if (element instanceof DependencyTreeNodeItem) {
      return element.children;
    }

    return [];
  }

  private buildNodes(
    nodes: any[] | undefined,
    parentId: string,
    direction: DependencyDirection,
    items: BeadItemData[]
  ): DependencyTreeNodeItem[] {
    if (!nodes || nodes.length === 0) {
      return [];
    }

    return nodes.map((node) => {
      const childItems = this.buildNodes(node.children, node.id, direction, items);
      const bead = items.find((i) => i.id === node.id);
      return new DependencyTreeNodeItem(node, parentId, direction, childItems, bead);
    });
  }
}
