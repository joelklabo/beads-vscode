import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface BeadItemData {
  id: string;
  title: string;
  filePath?: string;
  status?: string;
  tags?: string[];
  externalReferenceId?: string;
  raw?: unknown;
  idKey?: string;
  externalReferenceKey?: string;
}

interface BeadsDocument {
  filePath: string;
  root: unknown;
  beads: any[];
}

class BeadsTreeDataProvider implements vscode.TreeDataProvider<BeadTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BeadTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private items: BeadItemData[] = [];
  private document: BeadsDocument | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private watcherSubscriptions: vscode.Disposable[] = [];
  private watchedFilePath: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  getTreeItem(element: BeadTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BeadTreeItem): Promise<BeadTreeItem[]> {
    if (element) {
      return [];
    }

    if (this.items.length === 0) {
      await this.refresh();
    }

    return this.items.map((item) => this.createTreeItem(item));
  }

  async refresh(): Promise<void> {
    try {
      const result = await loadBeads();
      this.items = result.items;
      this.document = result.document;
      this.ensureWatcher(result.document.filePath);
      this.onDidChangeTreeDataEmitter.fire();
    } catch (error) {
      console.error('Failed to refresh beads', error);
      void vscode.window.showErrorMessage(formatError('Unable to refresh beads list', error));
    }
  }

  async updateExternalReference(item: BeadItemData, newValue: string | undefined): Promise<void> {
    if (!this.document) {
      void vscode.window.showErrorMessage('Beads data is not loaded yet. Try refreshing the explorer.');
      return;
    }

    if (!item.raw || typeof item.raw !== 'object') {
      void vscode.window.showErrorMessage('Unable to update this bead entry because its data is not editable.');
      return;
    }

    const targetKey = item.externalReferenceKey ?? 'external_reference_id';
    const mutable = item.raw as Record<string, unknown>;

    if (newValue && newValue.trim().length > 0) {
      mutable[targetKey] = newValue;
    } else {
      delete mutable[targetKey];
    }

    try {
      await saveBeadsDocument(this.document);
      await this.refresh();
    } catch (error) {
      console.error('Failed to persist beads document', error);
      void vscode.window.showErrorMessage(formatError('Failed to save beads data file', error));
    }
  }

  private createTreeItem(item: BeadItemData): BeadTreeItem {
    const treeItem = new BeadTreeItem(item);
    treeItem.contextValue = 'bead';

    if (item.filePath) {
      treeItem.command = {
        command: 'beads.openBead',
        title: 'Open Bead',
        arguments: [item],
      };
    }

    return treeItem;
  }

  private ensureWatcher(filePath: string): void {
    if (this.watchedFilePath === filePath && this.fileWatcher) {
      return;
    }

    this.disposeWatcher();

    try {
      const basePath = path.dirname(filePath);
      const filename = path.basename(filePath);
      const pattern = new vscode.RelativePattern(basePath, filename);
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onChange = watcher.onDidChange(() => void this.refresh());
      const onCreate = watcher.onDidCreate(() => void this.refresh());
      const onDelete = watcher.onDidDelete(async () => {
        this.items = [];
        this.document = undefined;
        this.onDidChangeTreeDataEmitter.fire();
      });

      this.context.subscriptions.push(watcher, onChange, onCreate, onDelete);
      this.fileWatcher = watcher;
      this.watcherSubscriptions = [onChange, onCreate, onDelete];
      this.watchedFilePath = filePath;
    } catch (error) {
      console.warn('Failed to start watcher for beads data file', error);
    }
  }

  private disposeWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    for (const subscription of this.watcherSubscriptions) {
      subscription.dispose();
    }
    this.watcherSubscriptions = [];
    this.watchedFilePath = undefined;
  }
}

class BeadTreeItem extends vscode.TreeItem {
  constructor(public readonly bead: BeadItemData) {
    super(bead.title, vscode.TreeItemCollapsibleState.None);

    const parts: string[] = [];
    if (bead.tags && bead.tags.length > 0) {
      parts.push(bead.tags.join(', '));
    }
    if (bead.externalReferenceId) {
      parts.push(bead.externalReferenceId);
    }
    if (parts.length > 0) {
      this.description = parts.join(' · ');
    }

    this.tooltip = createTooltip(bead);
    this.iconPath = new vscode.ThemeIcon('symbol-event');
  }
}

function createTooltip(bead: BeadItemData): string {
  const parts: string[] = [bead.title];
  if (bead.status) {
    parts.push(`Status: ${bead.status}`);
  }
  if (bead.filePath) {
    parts.push(`File: ${bead.filePath}`);
  }
  if (bead.tags && bead.tags.length > 0) {
    parts.push(`Tags: ${bead.tags.join(', ')}`);
  }
  if (bead.externalReferenceId) {
    parts.push(`External Reference: ${bead.externalReferenceId}`);
  }
  return parts.join('\n');
}

async function loadBeads(): Promise<{ items: BeadItemData[]; document: BeadsDocument; }> {
  const config = vscode.workspace.getConfiguration('beads');
  const projectRoot = resolveProjectRoot(config);
  const dataFileConfig = config.get<string>('dataFile', '.beads/beads.json');
  const resolvedDataFile = resolveDataFilePath(dataFileConfig, projectRoot);

  if (!resolvedDataFile) {
    throw new Error('Unable to resolve beads data file. Set "beads.projectRoot" or provide an absolute "beads.dataFile" path.');
  }

  const document = await readBeadsDocument(resolvedDataFile);
  const items = document.beads.map((entry, index) => normalizeBead(entry, index));
  return { items, document };
}

function resolveProjectRoot(config: vscode.WorkspaceConfiguration): string | undefined {
  const projectRootConfig = config.get<string>('projectRoot');
  if (projectRootConfig && projectRootConfig.trim().length > 0) {
    return projectRootConfig;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }

  return undefined;
}

function resolveDataFilePath(dataFile: string, projectRoot: string | undefined): string | undefined {
  if (!dataFile || dataFile.trim().length === 0) {
    return undefined;
  }

  if (path.isAbsolute(dataFile)) {
    return dataFile;
  }

  if (!projectRoot) {
    return undefined;
  }

  return path.join(projectRoot, dataFile);
}

async function readBeadsDocument(filePath: string): Promise<BeadsDocument> {
  const rawContent = await fs.readFile(filePath, 'utf8');
  const root = JSON.parse(rawContent);
  const beads = extractBeads(root);

  if (!Array.isArray(beads)) {
    throw new Error('Beads data file does not contain a beads array.');
  }

  return { filePath, root, beads };
}

async function saveBeadsDocument(document: BeadsDocument): Promise<void> {
  const serialized = JSON.stringify(document.root, null, 2);
  const content = serialized.endsWith('\n') ? serialized : `${serialized}\n`;
  await fs.writeFile(document.filePath, content, 'utf8');
}

function extractBeads(root: unknown): any[] | undefined {
  if (Array.isArray(root)) {
    return root;
  }

  if (root && typeof root === 'object') {
    const record = root as Record<string, unknown>;
    if (Array.isArray(record.beads)) {
      return record.beads as any[];
    }

    const project = record.project;
    if (project && typeof project === 'object') {
      const projectBeads = (project as Record<string, unknown>).beads;
      if (Array.isArray(projectBeads)) {
        return projectBeads as any[];
      }
    }
  }

  return undefined;
}

function normalizeBead(entry: any, index = 0): BeadItemData {
  const { value: id, key: idKey } = pickFirstKey(entry, ['id', 'uuid', 'beadId']);
  const title = pickValue(entry, ['title', 'name'], id ?? `bead-${index}`) ?? `bead-${index}`;
  const filePath = pickValue(entry, ['file', 'path', 'filename']);
  const status = pickValue(entry, ['status', 'state']);
  const tags = pickTags(entry);
  const { value: externalReferenceId, key: externalReferenceKey } = pickFirstKey(entry, [
    'external_reference_id',
    'externalReferenceId',
    'external_reference',
    'externalRefId',
  ]);

  return {
    id: id ?? `bead-${index}`,
    idKey,
    title,
    filePath,
    status,
    tags,
    externalReferenceId,
    externalReferenceKey,
    raw: entry,
  };
}

function pickValue(entry: any, keys: string[], fallback?: string): string | undefined {
  if (!entry || typeof entry !== 'object') {
    return fallback;
  }

  for (const key of keys) {
    if (key in entry) {
      const value = entry[key];
      if (value === undefined || value === null) {
        continue;
      }
      return String(value);
    }
  }

  return fallback;
}

function pickFirstKey(entry: any, keys: string[]): { value?: string; key?: string } {
  if (!entry || typeof entry !== 'object') {
    return {};
  }

  for (const key of keys) {
    if (key in entry) {
      const value = entry[key];
      if (value === undefined || value === null) {
        continue;
      }
      return { value: String(value), key };
    }
  }

  return {};
}

function pickTags(entry: any): string[] | undefined {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }

  const candidate = entry.tags ?? entry.tag_list ?? entry.labels;
  if (!candidate) {
    return undefined;
  }

  if (Array.isArray(candidate)) {
    return candidate.map((tag) => String(tag));
  }

  if (typeof candidate === 'string') {
    return candidate
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);
  }

  return undefined;
}

function formatError(prefix: string, error: unknown): string {
  if (error instanceof Error) {
    return `${prefix}: ${error.message}`;
  }
  return prefix;
}

async function openBead(item: BeadItemData): Promise<void> {
  if (!item.filePath) {
    void vscode.window.showWarningMessage('This bead does not have an associated file to open.');
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(item.filePath));
    await vscode.window.showTextDocument(document, { preview: false });
  } catch (error) {
    void vscode.window.showErrorMessage(formatError('Failed to open bead file', error));
  }
}

async function createBead(): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter a title for the new bead',
    placeHolder: 'Implement feature X',
  });

  if (!name) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beads');
  const commandPath = config.get<string>('commandPath', 'beads');
  const projectRoot = resolveProjectRoot(config);

  try {
    await execFileAsync(commandPath, ['create', name], { cwd: projectRoot });
    void vscode.commands.executeCommand('beads.refresh');
    void vscode.window.showInformationMessage(`Created bead: ${name}`);
  } catch (error) {
    void vscode.window.showErrorMessage(formatError('Failed to create bead', error));
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new BeadsTreeDataProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('beadsExplorer', provider),
    vscode.commands.registerCommand('beads.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('beads.openBead', (item: BeadItemData) => openBead(item)),
    vscode.commands.registerCommand('beads.createBead', () => createBead()),
    vscode.commands.registerCommand('beads.editExternalReference', async (item: BeadItemData) => {
      if (!item) {
        return;
      }

      const newValue = await vscode.window.showInputBox({
        prompt: 'Set the external reference identifier for this bead',
        value: item.externalReferenceId ?? '',
        placeHolder: 'Enter an ID or leave empty to remove',
      });

      if (newValue === undefined) {
        return;
      }

      await provider.updateExternalReference(item, newValue.trim().length > 0 ? newValue.trim() : undefined);
    }),
  );

  void provider.refresh();
}

export function deactivate(): void {
  // no-op
}
