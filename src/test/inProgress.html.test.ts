/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

// Minimal vscode stub
const vscodeStub = {
  l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
};

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad(request, parent);
};

import { getInProgressPanelHtml, buildInProgressPanelStrings } from '../views/inProgress/html';
import { BeadItemData } from '../utils';

describe('getInProgressPanelHtml', () => {
  after(() => {
    (Module as any)._load = originalLoad;
  });

  it('renders status/type/priority chips for in-progress cards', () => {
    const items: BeadItemData[] = [
      {
        id: 'beads-123',
        title: 'Implement chips',
        status: 'in_progress',
        updatedAt: new Date().toISOString(),
        inProgressSince: new Date().toISOString(),
        raw: { priority: 1, issue_type: 'feature' },
      } as any,
    ];

    const html = getInProgressPanelHtml(items, buildInProgressPanelStrings(), 'en');
    assert.ok(html.includes('bead-chip status status-in_progress'), 'status chip missing');
    assert.ok(html.includes('bead-chip priority priority-1'), 'priority chip missing');
    assert.ok(html.includes('bead-chip type type-feature'), 'type chip missing');
    assert.ok(html.includes('assignee-initials'), 'assignee pill missing');
  });
});
