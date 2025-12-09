import * as assert from 'assert';
import { STATUS_TOKENS, PRIORITY_TOKENS, ISSUE_TYPE_TOKENS, PULSE_ANIMATION_NAME } from '../../views/shared/theme';
import { toViewModel } from '../../utils/beads';

describe('issues view model + tokens', () => {
  it('exposes deterministic status/priority/type tokens', () => {
    assert.strictEqual(STATUS_TOKENS.in_progress.pulsing, true);
    assert.ok(STATUS_TOKENS.closed.background.includes('color-mix'));
    assert.strictEqual(PRIORITY_TOKENS[0].label, 'P0');
    assert.strictEqual(ISSUE_TYPE_TOKENS.feature.icon, 'sparkle');
    assert.ok(PULSE_ANIMATION_NAME.length > 0);
  });

  it('maps bead item to view model with type icon and assignee color placeholder', () => {
    const vm = toViewModel({
      id: 'X-1',
      title: 'Example',
      status: 'in_progress',
      issueType: 'feature',
      labels: ['one'],
      assignee: 'Ada Lovelace',
      updatedAt: new Date().toISOString(),
      raw: {
        priority: 1,
      },
    } as any);

    assert.strictEqual(vm.id, 'X-1');
    assert.strictEqual(vm.status, 'in_progress');
    assert.strictEqual(vm.priority, 1);
    assert.strictEqual(vm.icon?.id, 'sparkle');
    assert.strictEqual(vm.assignee?.color, 'var(--vscode-charts-blue)');
  });
});
