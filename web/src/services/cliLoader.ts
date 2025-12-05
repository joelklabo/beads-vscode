import { BdCliClient, BeadItemData, BeadsDocument, normalizeBead } from '@beads/core';

function parseJsonLines(stdout: string): any[] {
  if (!stdout || !stdout.trim()) {
    return [];
  }
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function loadFromCli(workspaceRoot: string): Promise<{ items: BeadItemData[]; document: BeadsDocument }> {
  const client = new BdCliClient({ cwd: workspaceRoot, workspacePaths: [workspaceRoot] });
  const { stdout } = await client.export();
  const beads = parseJsonLines(stdout);
  const items = beads.map((raw, index) => normalizeBead(raw, index));
  items.sort((a, b) => a.id.localeCompare(b.id));
  const document: BeadsDocument = {
    filePath: `${workspaceRoot}/.beads`,
    root: beads,
    beads,
    watchPaths: [],
  };
  return { items, document };
}
