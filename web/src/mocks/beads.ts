import { BeadItemData, BeadsDocument, normalizeBead } from '@beads/core';

const RAW_BEADS = [
  {
    id: 'beads-100',
    title: 'Bootstrap web shell',
    status: 'open',
    priority: 2,
    labels: ['web', 'shared-core'],
    description: 'Proof-of-concept UI backed by shared headless hooks.',
    dependencies: [{ depends_on_id: 'beads-200', dep_type: 'blocks' }],
  },
  {
    id: 'beads-200',
    title: 'Headless hooks ready',
    status: 'in_progress',
    priority: 1,
    in_progress_since: new Date().toISOString(),
    labels: ['core'],
    description: 'Hooks return view models for multiple renderers.',
  },
  {
    id: 'beads-300',
    title: 'Document architecture',
    status: 'closed',
    priority: 3,
    labels: ['docs'],
    dependencies: [{ depends_on_id: 'beads-100', dep_type: 'related' }],
  },
];

export function loadMockBeads(): { items: BeadItemData[]; document: BeadsDocument } {
  const items = RAW_BEADS.map((raw, index) => normalizeBead(raw, index));
  const document: BeadsDocument = {
    filePath: 'mock://beads',
    root: RAW_BEADS,
    beads: RAW_BEADS,
    watchPaths: [],
  };
  return { items, document };
}
