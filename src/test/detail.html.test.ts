/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

const vscodeStub = {
  l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
  env: { language: 'en' },
  workspace: { getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }) },
};

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad(request, parent);
};

import { getBeadDetailHtml } from '../views/detail/html';
import { buildDependencyTrees } from '../utils';

const fakeWebview = { cspSource: 'vscode-resource', asWebviewUri: () => '' } as any;

const strings = {
  statusLabels: {
    open: 'Open',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    closed: 'Closed'
  },
  assigneeFallback: 'Unassigned',
  deleteLabel: 'Delete',
  designLabel: 'Design',
  notesLabel: 'Notes',
  acceptanceLabel: 'Acceptance',
  labelsLabel: 'Labels',
  dependencyTreeTitle: 'Deps',
  dependencyTreeUpstream: 'Upstream',
  dependencyTreeDownstream: 'Downstream',
  dependencyEmptyLabel: 'Empty',
  addUpstreamLabel: 'Add Upstream',
  addDownstreamLabel: 'Add Downstream',
  descriptionLabel: 'Description',
  createdLabel: 'Created',
  updatedLabel: 'Updated',
  externalRefLabel: 'External',
  deleteConfirm: 'Confirm',
  deleteConfirmDetail: 'Are you sure?',
  deleteConfirmButton: 'Delete',
  cancelLabel: 'Cancel'
} as any;

const sample = {
  id: 'beads-321',
  title: 'Detail hero chips',
  status: 'in_progress',
  updatedAt: new Date().toISOString(),
  raw: { issue_type: 'epic', priority: 0, labels: ['alpha'], description: 'desc' },
} as any;

describe('getBeadDetailHtml', () => {
  after(() => { (Module as any)._load = originalLoad; });

  it('includes status/type/priority chips in header', () => {
    const html = getBeadDetailHtml(sample, [], fakeWebview, 'nonce', strings, 'en');
    assert.ok(html.includes('bead-chip status status-in_progress'), 'status chip missing');
    assert.ok(html.includes('bead-chip type type-epic'), 'type chip missing');
    assert.ok(html.includes('bead-chip priority priority-0'), 'priority chip missing');
  });
});
