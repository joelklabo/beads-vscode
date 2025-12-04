import * as assert from 'assert';
import Module = require('module');
import { stripBeadIdPrefix } from '../utils/beads';
import { buildPreviewSnippet } from '../utils/format';

function createVscodeStub() {
  class ThemeIcon {
    constructor(public id: string, public color?: any) {}
  }
  class ThemeColor {
    constructor(public id: string) {}
  }
  class TreeItem {
    public label?: any;
    public description?: string;
    public tooltip?: any;
    public iconPath?: any;
    public contextValue?: string;
    constructor(label?: any, public collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }
  class MarkdownString {
    value = '';
    isTrusted = false;
    supportHtml = false;
    appendMarkdown(md: string): void {
      this.value += md;
    }
  }

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  return {
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    TreeItem,
    ThemeIcon,
    ThemeColor,
    MarkdownString,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    workspace: {
      getConfiguration: () => ({ get: (_key: string, fallback: any) => fallback })
    },
    window: {
      showInformationMessage: () => undefined,
      showWarningMessage: () => undefined
    }
  } as any;
}

describe('Bead title formatting', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let BeadTreeItem: any;

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub();
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    BeadTreeItem = extension.BeadTreeItem;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('strips bead id prefix from labels and moves id to description', () => {
    const item = new BeadTreeItem({
      id: 'ABC-12',
      title: 'ABC-12 Fix login redirect',
      description: 'Line one\nLine two',
      status: 'open'
    });

    assert.strictEqual(item.label, 'Fix login redirect');
    assert.ok(item.description?.includes('ABC-12'), 'description should include id');
  });

  it('builds preview snippet with ellipsis for long descriptions', () => {
    const longDesc = 'This is a very long description that should be trimmed into a concise preview without breaking keyboard navigation or search.';
    const item = new BeadTreeItem({
      id: 'XYZ-99',
      title: 'XYZ-99: Long task',
      description: longDesc,
      status: 'open'
    });

    assert.ok(item.description?.includes('XYZ-99'));
    const preview = buildPreviewSnippet(longDesc, 40);
    assert.ok(preview?.endsWith('…'));
    assert.ok(item.description?.includes(preview!.slice(0, 10)), 'tree description should include preview snippet');
  });

  it('helper functions normalize ids and previews', () => {
    assert.strictEqual(stripBeadIdPrefix('[ABC-1] Title', 'ABC-1'), 'Title');
    assert.strictEqual(buildPreviewSnippet('  spaced    text  ', 10), 'spaced te…');
  });
});
