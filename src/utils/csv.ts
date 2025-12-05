import { promises as fs } from 'fs';
import { BeadItemData } from './beads';

export interface CsvExportHeaders {
  id: string;
  title: string;
  status: string;
  type: string;
  labels: string;
  updated: string;
}

export interface CsvExportOptions {
  delimiter?: string;
  includeBom?: boolean;
}

export function normalizeCsvDelimiter(input?: string): string {
  if (!input || typeof input !== 'string') {
    return ',';
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return ',';
  }

  if (trimmed.toLowerCase() === 'tab' || trimmed === '\\t') {
    return '\t';
  }

  return trimmed;
}

function escapeCsvValue(value: string, delimiter: string): string {
  const normalized = (value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const needsQuote = normalized.includes('"') || normalized.includes('\n') || (delimiter && normalized.includes(delimiter));
  const escaped = normalized.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export function buildBeadsCsv(beads: BeadItemData[], headers: CsvExportHeaders, delimiter = ','): string {
  const effectiveDelimiter = normalizeCsvDelimiter(delimiter);
  const headerRow = [
    headers.id,
    headers.title,
    headers.status,
    headers.type,
    headers.labels,
    headers.updated,
  ].map((value) => escapeCsvValue(value, effectiveDelimiter)).join(effectiveDelimiter);

  const rows = beads.map((bead) => {
    const labels = bead.tags && bead.tags.length > 0 ? bead.tags.join(', ') : '';
    const cells = [
      bead.id ?? '',
      bead.title ?? '',
      bead.status ?? '',
      bead.issueType ?? '',
      labels,
      bead.updatedAt ?? ''
    ];

    return cells.map((value) => escapeCsvValue(String(value ?? ''), effectiveDelimiter)).join(effectiveDelimiter);
  });

  return [headerRow, ...rows].join('\n');
}

export async function writeBeadsCsvFile(
  beads: BeadItemData[],
  headers: CsvExportHeaders,
  filePath: string,
  options: CsvExportOptions = {}
): Promise<void> {
  const delimiter = normalizeCsvDelimiter(options.delimiter);
  const includeBom = options.includeBom ?? false;
  const content = buildBeadsCsv(beads, headers, delimiter);
  const payload = includeBom ? `\uFEFF${content}` : content;

  await fs.writeFile(filePath, payload, 'utf8');
}
