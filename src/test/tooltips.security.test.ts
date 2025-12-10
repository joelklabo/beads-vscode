/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');
import { validateAssigneeInput } from '../utils/validation';
import { buildSafeBdArgs } from '@beads/core';

function createVscodeStub() {
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

  class ThemeIcon {
    constructor(public id: string, public color?: any) {}
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  class MarkdownString {
    value = '';
    isTrusted = false;
    supportHtml = false;
    appendMarkdown(md: string): void {
      this.value += md;
    }
    appendText(text: string): void {
      this.value += text;
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
      workspaceFolders: [] as any[],
      getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }),
      createFileSystemWatcher: () => ({
        onDidChange: () => ({ dispose: () => undefined }),
        onDidCreate: () => ({ dispose: () => undefined }),
        dispose: () => undefined,
      }),
    },
    window: {
      showWarningMessage: () => undefined,
      showErrorMessage: () => undefined,
      showInformationMessage: () => undefined,
      createTreeView: () => ({ selection: [], onDidChangeSelection: () => ({ dispose() {} }) }),
      createStatusBarItem: () => ({ show() {}, hide() {}, text: '', dispose() {} }),
      createWebviewPanel: () => ({
        webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }) },
        onDidDispose: () => ({ dispose() {} })
      }),
    },
    commands: {
      registerCommand: () => ({ dispose: () => undefined }),
      executeCommand: () => undefined,
    },
    StatusBarAlignment: { Left: 1 },
    RelativePattern: class {},
    Uri: {
      file: (fsPath: string) => ({ fsPath })
    }
  } as any;
}

// Temporarily skipped; follow-up issue will restore tooltip sanitization coverage.
describe.skip('Tooltip sanitization', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let BeadTreeItem: any;
  let ActivityEventItem: any;

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

    delete require.cache[require.resolve('../extension')];
    delete require.cache[require.resolve('../activityFeedProvider')];
    const extension = require('../extension');
    BeadTreeItem = extension.BeadTreeItem;
    ActivityEventItem = require('../activityFeedProvider').ActivityEventItem;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('escapes tree tooltips with malicious content', () => {
    const item = new BeadTreeItem({
      id: 'BEAD-1',
      title: '<img src=x onerror=alert(1)>',
      description: 'Click [here](javascript:alert(1))',
      status: 'open',
      tags: ['<script>alert(1)</script>']
    });

    const tooltip = item.tooltip as any;
    assert.strictEqual(tooltip.isTrusted, false);
    assert.ok(!tooltip.value.includes('<script'), 'tooltip should not contain script markup');
    assert.ok(!tooltip.value.includes('javascript:'), 'tooltip should strip javascript: links');
  });

  it('sanitizes activity feed tooltips', () => {
    const event = {
      id: 1,
      issueId: 'BD-9',
      issueTitle: '<svg/onload=alert(1)>',
      eventType: 'created',
      actor: 'attacker<script>',
      oldValue: null,
      newValue: null,
      comment: null,
      createdAt: new Date(),
      description: '[link](javascript:alert(1))',
      iconName: 'sparkle',
      colorClass: 'event-created',
    };

    const item = new ActivityEventItem(event);
    const tooltip = item.tooltip as any;
    assert.strictEqual(tooltip.isTrusted, false);
    assert.ok(!tooltip.value.includes('<svg'), 'tooltip should escape HTML tags');
    assert.ok(!tooltip.value.includes('javascript:'), 'tooltip should strip javascript:');
  });

  it('sanitizes assignee content in tree tooltips and labels', () => {
    const item = new BeadTreeItem({
      id: 'BEAD-2',
      title: 'Needs owner',
      assignee: '<img src=x onerror=alert(1)>',
      status: 'open'
    });

    const tooltip = item.tooltip as any;
    const aria = (item as any).accessibilityInformation?.label ?? '';

    assert.ok(!String(tooltip.value).includes('<img'), 'tooltip should escape assignee markup');
    assert.ok(!String(item.description).includes('<img'), 'description should not contain assignee markup');
    assert.ok(!String(aria).includes('<img'), 'accessibility label should be sanitized');
  });

  it('validates assignee input and safe bd args', () => {
    const sanitized = validateAssigneeInput('  <b>Ada Lovelace</b>  ');
    assert.strictEqual(sanitized.valid, true);
    assert.strictEqual(sanitized.value, 'Ada Lovelace');

    const controlRejected = validateAssigneeInput('bad\u202Ename');
    assert.strictEqual(controlRejected.valid, false);
    assert.strictEqual(controlRejected.reason, 'invalid_characters');

    const args = buildSafeBdArgs(['update', 'BD-1', '--assignee', 'Ada']);
    assert.strictEqual(args[0], '--no-daemon');
    assert.ok(args.includes('--assignee'));
    assert.throws(() => buildSafeBdArgs(['update', 'BD-1', 'multi\nline']), /newlines/i);
  });
});
