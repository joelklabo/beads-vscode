import { promises as fs } from 'fs';
import { BeadItemData } from './beads';

export interface MarkdownExportHeaders {
  id: string;
  title: string;
  status: string;
  type: string;
  labels: string;
  updated: string;
}

function sanitizeCell(value: string | undefined): string {
  if (!value) {
    return 'N/A';
  }

  return value
    .replace(/\|/g, '\\|')
    .replace(/\r?\n|\r/g, ' ')
    .trim();
}

export function buildBeadsMarkdownTable(beads: BeadItemData[], headers: MarkdownExportHeaders): string {
  const headerRow = `| ${headers.id} | ${headers.title} | ${headers.status} | ${headers.type} | ${headers.labels} | ${headers.updated} |`;
  const separatorRow = '| --- | --- | --- | --- | --- | --- |';

  const rows = beads.map((bead) => {
    const labelText = bead.tags && bead.tags.length > 0 ? bead.tags.join(', ') : '';
    const cells = [
      sanitizeCell(bead.id),
      sanitizeCell(bead.title),
      sanitizeCell(bead.status),
      sanitizeCell(bead.issueType),
      sanitizeCell(labelText),
      sanitizeCell(bead.updatedAt)
    ];

    return `| ${cells.join(' | ')} |`;
  });

  return [headerRow, separatorRow, ...rows].join('\n');
}

export async function writeBeadsMarkdownFile(
  beads: BeadItemData[],
  headers: MarkdownExportHeaders,
  filePath: string
): Promise<void> {
  const content = buildBeadsMarkdownTable(beads, headers);
  await fs.writeFile(filePath, content, 'utf8');
}
