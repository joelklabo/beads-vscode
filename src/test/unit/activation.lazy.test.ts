import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

describe('activation configuration', () => {
  const pkgPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const events: string[] = pkg.activationEvents;

  it('defines explicit activation events (no wildcard)', () => {
    assert.ok(Array.isArray(events) && events.length > 0, 'activationEvents must be a non-empty array');
    assert.ok(!events.includes('*'), 'activationEvents must not include wildcard');
  });

  it('activates on core views and commands', () => {
    const required = [
      'onView:beady.issuesView',
      'onView:activityFeed',
      'onCommand:beady.refresh',
      'onCommand:beady.createBead',
      'onChatParticipant:beady.task-creator',
    ];
    required.forEach((evt) => assert.ok(events.includes(evt), `activationEvents missing ${evt}`));
  });
});
