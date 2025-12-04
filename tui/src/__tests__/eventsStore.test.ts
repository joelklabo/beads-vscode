import assert from 'assert';
import { buildSections, filterEvents, bucketFor } from '../state/eventsStore';

const now = new Date('2025-12-04T12:00:00Z');

const sample = [
  {
    id: '1',
    issueId: 'bd-1',
    description: 'Created issue',
    actor: 'alice',
    createdAt: '2025-12-04T11:30:00Z',
  },
  {
    id: '2',
    issueId: 'bd-2',
    description: 'Updated issue',
    actor: 'bob',
    createdAt: '2025-12-03T23:59:00Z',
  },
  {
    id: '3',
    issueId: 'bd-3',
    description: 'Blocked by other',
    actor: 'alice',
    worktreeId: 'wt-1',
    createdAt: '2025-11-30T10:00:00Z',
  },
];

function run(): void {
  const filtered = filterEvents(sample, { actor: 'alice', worktreeId: 'wt-1' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, '3');

  const sections = buildSections(sample, {}, now);
  const titles = sections.map((s) => s.title);
  assert.deepStrictEqual(titles, ['Today', 'Yesterday', 'This Week']);

  const today = new Date('2025-12-04T00:00:01Z');
  const yesterday = new Date('2025-12-03T10:00:00Z');
  const lastWeek = new Date('2025-11-20T10:00:00Z');
  assert.strictEqual(bucketFor(today, now), 'Today');
  assert.strictEqual(bucketFor(yesterday, now), 'Yesterday');
  assert.strictEqual(bucketFor(lastWeek, now), 'Older');

  console.log('✅ eventsStore tests passed');
}

run();
