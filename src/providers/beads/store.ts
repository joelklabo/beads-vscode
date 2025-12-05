import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { BeadItemData, extractBeads, normalizeBead } from '@beads/core';
import { execCliWithPolicy, getCliExecutionConfig, resolveDataFilePath } from '../../utils';

const execFileAsync = promisify(execFile);

export interface BeadsDocument {
  filePath: string;
  root: unknown;
  beads: any[];
}

export function naturalSort(a: BeadItemData, b: BeadItemData): number {
  const aParts = a.id.split(/(\d+)/);
  const bParts = b.id.split(/(\d+)/);

  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];

    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) {
        return aNum - bNum;
      }
    } else {
      if (aPart !== bPart) {
        return aPart.localeCompare(bPart);
      }
    }
  }

  return aParts.length - bParts.length;
}

export async function findBdCommand(configPath: string): Promise<string> {
  if (configPath && configPath !== 'bd') {
    return configPath;
  }

  try {
    await execFileAsync('bd', ['--version']);
    return 'bd';
  } catch {
    // fall through
  }

  const commonPaths = [
    '/opt/homebrew/bin/bd',
    '/usr/local/bin/bd',
    path.join(os.homedir(), '.local/bin/bd'),
    path.join(os.homedir(), 'go/bin/bd'),
  ];

  for (const candidate of commonPaths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('bd command not found. Please install beads CLI: https://github.com/steveyegge/beads');
}

export async function loadBeads(
  projectRoot: string,
  config: vscode.WorkspaceConfiguration
): Promise<{ items: BeadItemData[]; document: BeadsDocument }> {
  const configPath = config.get<string>('commandPath', 'bd');

  try {
    const commandPath = await findBdCommand(configPath);
    const policy = getCliExecutionConfig(config);
    const { stdout } = await execCliWithPolicy({
      commandPath,
      args: ['export'],
      cwd: projectRoot,
      policy,
      maxBuffer: 10 * 1024 * 1024,
    });

    let beads: any[] = [];
    if (stdout && stdout.trim()) {
      const lines = stdout.trim().split('\n');
      beads = lines.map((line) => JSON.parse(line));
    }

    const dbPath = path.join(projectRoot, '.beads');
    const document: BeadsDocument = { filePath: dbPath, root: beads, beads };
    const items = beads.map((entry, index) => normalizeBead(entry, index));
    items.sort(naturalSort);
    return { items, document };
  } catch (error) {
    console.warn('Failed to load beads via CLI, falling back to file reading:', (error as Error).message);
    return loadBeadsFromFile(projectRoot, config);
  }
}

export async function loadBeadsFromFile(
  projectRoot: string,
  config: vscode.WorkspaceConfiguration
): Promise<{ items: BeadItemData[]; document: BeadsDocument }> {
  const dataFileConfig = config.get<string>('dataFile', '.beads/issues.jsonl');
  const resolvedDataFile = resolveDataFilePath(dataFileConfig, projectRoot);

  if (!resolvedDataFile) {
    throw new Error('Unable to resolve beads data file. Set "beads.projectRoot" or provide an absolute "beads.dataFile" path.');
  }

  const document = await readBeadsDocument(resolvedDataFile);
  const items = document.beads.map((entry, index) => normalizeBead(entry, index));
  items.sort(naturalSort);
  return { items, document };
}

export async function readBeadsDocument(filePath: string): Promise<BeadsDocument> {
  const rawContent = await fs.readFile(filePath, 'utf8');

  if (filePath.endsWith('.jsonl')) {
    const lines = rawContent.trim().split('\n').filter((line) => line.trim().length > 0);
    const beads = lines.map((line) => JSON.parse(line));
    return { filePath, root: beads, beads };
  }

  const root = JSON.parse(rawContent);
  const beads = extractBeads(root);
  if (!Array.isArray(beads)) {
    throw new Error('Beads data file does not contain a beads array.');
  }

  return { filePath, root, beads };
}

export async function saveBeadsDocument(document: BeadsDocument): Promise<void> {
  if (document.filePath.endsWith('.jsonl')) {
    const lines = document.beads.map((bead) => JSON.stringify(bead)).join('\n');
    const content = lines.endsWith('\n') ? lines : `${lines}\n`;
    await fs.writeFile(document.filePath, content, 'utf8');
  } else {
    const serialized = JSON.stringify(document.root, null, 2);
    const content = serialized.endsWith('\n') ? serialized : `${serialized}\n`;
    await fs.writeFile(document.filePath, content, 'utf8');
  }
}
