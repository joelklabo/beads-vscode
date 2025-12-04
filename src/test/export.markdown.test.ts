import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BeadItemData } from '../utils';
import { buildBeadsMarkdownTable, writeBeadsMarkdownFile } from '../utils/markdown';

describe('Markdown export', () => {
  const headers = {
    id: 'ID',
    title: 'Title',
    status: 'Status',
    type: 'Type',
    labels: 'Labels',
    updated: 'Updated',
  };

  it('builds markdown table with sanitized cells', () => {
    const beads: BeadItemData[] = [
      {
        id: 'ABC-1',
        title: 'Pipe | break',
        status: 'open',
        issueType: 'task',
        tags: ['backend', 'p1'],
        updatedAt: '2025-12-01T12:00:00Z',
      },
    ];

    const markdown = buildBeadsMarkdownTable(beads, headers);
    const lines = markdown.split('\n');

    assert.strictEqual(lines[0], '| ID | Title | Status | Type | Labels | Updated |');
    assert.strictEqual(lines[1], '| --- | --- | --- | --- | --- | --- |');
    assert.ok(lines[2].includes('Pipe \\| break'));
    assert.ok(!/\n/.test(lines[2]), 'Row should not contain raw newlines');
  });

  it('writes markdown export to the workspace tmp directory', async () => {
    const beads: BeadItemData[] = [
      {
        id: 'ABC-2',
        title: 'First item',
        status: 'in_progress',
        issueType: 'feature',
        tags: ['frontend'],
        updatedAt: '2025-12-02T15:30:00Z',
      },
      {
        id: 'ABC-3',
        title: 'Second item without status',
        tags: [],
      },
    ];

    const tmpDir = path.join(process.cwd(), 'tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    const targetPath = path.join(tmpDir, `export-${Date.now()}.md`);

    await writeBeadsMarkdownFile(beads, headers, targetPath);
    const contents = await fs.readFile(targetPath, 'utf8');

    assert.ok(contents.includes('ABC-2'));
    assert.ok(contents.includes('ABC-3'));
    assert.ok(contents.includes('N/A'), 'Missing fields should be represented as N/A');

    await fs.rm(targetPath, { force: true });
  });
});
