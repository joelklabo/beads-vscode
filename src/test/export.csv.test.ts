import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BeadItemData } from '../utils';
import { buildBeadsCsv, writeBeadsCsvFile, normalizeCsvDelimiter } from '../utils/csv';

describe('CSV export', () => {
  const headers = {
    id: 'ID',
    title: 'Title',
    status: 'Status',
    type: 'Type',
    labels: 'Labels',
    updated: 'Updated',
  };

  it('builds CSV with escaped values', () => {
    const beads: BeadItemData[] = [
      {
        id: 'ABC-1',
        title: 'Hello, "world"\nnext line',
        status: 'open',
        issueType: 'task',
        tags: ['foo', 'bar'],
        updatedAt: '2025-12-01T12:00:00Z',
      },
    ];

    const csv = buildBeadsCsv(beads, headers);
    const firstBreak = csv.indexOf('\n');
    const header = csv.slice(0, firstBreak);
    const row = csv.slice(firstBreak + 1);

    assert.strictEqual(header, 'ID,Title,Status,Type,Labels,Updated');
    assert.ok(row.startsWith('ABC-1,"Hello, ""world""\nnext line",open,task,"foo, bar",2025-12-01T12:00:00Z'));
  });

  it('writes CSV with custom delimiter and BOM', async () => {
    const beads: BeadItemData[] = [
      { id: 'XYZ-1', title: 'One', status: 'blocked', issueType: 'bug', tags: ['a'], updatedAt: '2025-12-03' },
      { id: 'XYZ-2', title: 'Two', status: 'closed', issueType: 'task', tags: [], updatedAt: '2025-12-04' },
    ];

    const tmpDir = path.join(process.cwd(), 'tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `export-${Date.now()}.csv`);

    await writeBeadsCsvFile(beads, headers, filePath, { delimiter: ';', includeBom: true });
    const contents = await fs.readFile(filePath, 'utf8');

    assert.strictEqual(contents.charCodeAt(0), 0xfeff, 'should include UTF-8 BOM');
    assert.ok(contents.includes('XYZ-1;One;blocked;bug;a;2025-12-03'));

    await fs.rm(filePath, { force: true });
  });

  it('normalizes tab delimiter shorthand', () => {
    assert.strictEqual(normalizeCsvDelimiter('\\t'), '\t');
    assert.strictEqual(normalizeCsvDelimiter('tab'), '\t');
  });
});
