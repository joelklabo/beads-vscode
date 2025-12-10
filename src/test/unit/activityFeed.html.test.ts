import * as assert from 'assert';
import type { EventData } from '../../activityFeed';
import type { ActivityFeedStrings } from '../../views/activityFeed/html';

// Stub vscode l10n before requiring the module under test.
const Module: any = require('module');
const vscodeStub = {
  l10n: {
    t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_: string, index: string) => {
      const i = Number(index);
      return String(args[i] ?? '');
    }),
  },
};
const originalLoad = Module._load;
Module._load = function(request: string, parent: any, isMain: boolean) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { getActivityFeedPanelHtml } = require('../../views/activityFeed/html') as typeof import('../../views/activityFeed/html');

describe('activity feed html', () => {
  const strings: ActivityFeedStrings = {
    title: 'Activity',
    emptyTitle: 'No activity yet',
    emptyDescription: 'Try running a command',
    eventsLabel: 'events',
  };

  it('renders codicons, status/type chips, and themed timeline dots', () => {
    const events: EventData[] = [
      {
        id: 1,
        issueId: 'BD-10',
        issueTitle: 'Refactor graph',
        worktreeId: 'wt-1',
        eventType: 'priority_changed',
        actor: 'Ada Lovelace',
        oldValue: { raw: 'P1', priority: 1 } as any,
        newValue: { raw: 'P0', priority: 0 } as any,
        comment: null,
        createdAt: new Date('2025-12-01T12:00:00Z'),
        description: 'Priority: P1 → P0',
        iconName: 'flame',
        colorClass: 'event-warning',
        // The view reads issueType from the event object.
        issueType: 'feature' as any,
      } as any,
    ];

    const html = getActivityFeedPanelHtml(events, strings, 'en-US');

    assert.ok(html.includes('class="codicon codicon-flame"'), 'uses codicon icon instead of emoji');
    assert.ok(html.includes('class="bead-chip status status-blocked'), 'renders status chip');
    assert.ok(html.includes('class="bead-chip type type-feature'), 'renders type chip');
    assert.ok(html.includes('class="codicon codicon-sparkle"'), 'renders type codicon');
    assert.ok(html.includes('style="background-color: var(--vscode-charts-red);'), 'timeline dot themed by status color');
    assert.ok(!html.includes('🔥'), 'does not emit raw emoji icons');
  });

  it('shows empty state when no events', () => {
    const html = getActivityFeedPanelHtml([], strings, 'en-US');
    assert.ok(html.includes('empty-state-icon'), 'renders placeholder icon');
    assert.ok(html.includes('📋'), 'uses clipboard glyph for empty state');
  });
});

after(() => {
  Module._load = originalLoad;
});
