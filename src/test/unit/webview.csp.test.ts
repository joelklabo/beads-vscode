import * as assert from 'assert';
import Module = require('module');

describe('webview CSP regression', () => {
  describe('issues webview', () => {
    let capturedHtml = '';
    let restoreLoad: any;
    let vscodeCacheKeys: string[] = [];

    before(() => {
      const moduleAny = Module as any;
      restoreLoad = moduleAny._load;

      vscodeCacheKeys = Object.keys(require.cache).filter(key => key.includes('vscode'));
      vscodeCacheKeys.forEach(key => delete require.cache[key]);
      Object.keys(require.cache).forEach((key) => {
        if (key.includes('providers/beads/webview')) {
          delete require.cache[key];
        }
      });

      const vscodeStub: any = {
        l10n: { t: (m: string) => m },
        Uri: {
          file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
          joinPath: (_base: any, ...paths: string[]) => ({ fsPath: paths.join('/') }),
        },
        window: {
          registerWebviewViewProvider: (_: string, provider: any) => {
            const webviewView: any = {
              webview: {
                cspSource: 'vscode-resource',
                html: '',
                options: {},
                asWebviewUri: (uri: any) => ({ toString: () => `vscode-resource://${uri.fsPath}` }),
                onDidReceiveMessage: () => ({ dispose: () => undefined }),
                postMessage: () => Promise.resolve(),
              },
            };
            provider.resolveWebviewView(webviewView, {} as any, {} as any);
            capturedHtml = webviewView.webview.html;
            return { dispose: () => undefined };
          },
          createTreeView: () => ({ onDidDispose: () => ({ dispose: () => undefined }) }),
          createStatusBarItem: () => ({ show: () => undefined, dispose: () => undefined }),
        },
        commands: { executeCommand: () => undefined },
        workspace: { getConfiguration: () => ({ get: (_: string, v: any) => v }) },
      };

      moduleAny._load = (request: string, parent: any, isMain: boolean) => {
        if (request === 'vscode') {
          return vscodeStub;
        }
        return restoreLoad(request, parent, isMain);
      };

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BeadsWebviewProvider } = require('../../providers/beads/webview');
      const dataSource = {
        onDidChangeTreeData: () => ({ dispose: () => undefined }),
        getVisibleBeads: () => [],
        getSortMode: () => 'id',
      };
      const provider = new BeadsWebviewProvider({ fsPath: '/ext' } as any, dataSource as any);
      vscodeStub.window.registerWebviewViewProvider(BeadsWebviewProvider.viewType, provider);
    });

    after(() => {
      const moduleAny = Module as any;
      moduleAny._load = restoreLoad;
      vscodeCacheKeys.forEach(key => delete require.cache[key]);
    });

    it('enforces strict CSP with nonce and cspSource', () => {
      assert.ok(capturedHtml.includes('Content-Security-Policy'), 'missing CSP meta');
      assert.ok(capturedHtml.includes('vscode-resource'), 'webview.cspSource missing');
      assert.ok(/default-src 'none'/.test(capturedHtml), 'default-src not none');
      assert.ok(/script-src 'nonce-/.test(capturedHtml), 'nonce missing from script-src');
      assert.ok(!/unsafe-inline/.test(capturedHtml), 'CSP allows unsafe-inline');
      assert.ok(!/unsafe-eval/.test(capturedHtml), 'CSP allows unsafe-eval');
    });

    it('only uses nonced external scripts and no inline handlers', () => {
      const scriptTags = capturedHtml.match(/<script[^>]*>/g) || [];
      assert.strictEqual(scriptTags.length, 1, 'expected single script tag');
      assert.ok(/nonce=/.test(scriptTags[0]), 'script tag missing nonce');
      assert.ok(/src=/.test(scriptTags[0]), 'script tag missing src');
      assert.ok(!/\son\w+=/i.test(capturedHtml), 'inline event handler present');
    });

    it('issues stylesheet link is nonced', () => {
      const styleLink = capturedHtml.match(/<link[^>]*issues\.css[^>]*>/);
      assert.ok(styleLink, 'issues.css link missing');
      assert.ok(/nonce=/.test(styleLink[0]), 'issues.css link missing nonce');
    });
  });

  describe('graph webview', () => {
    let capturedHtml = '';
    let restoreLoad: any;
    let vscodeCacheKeys: string[] = [];

    before(() => {
      const moduleAny = Module as any;
      restoreLoad = moduleAny._load;

      vscodeCacheKeys = Object.keys(require.cache).filter(key => key.includes('vscode'));
      vscodeCacheKeys.forEach(key => delete require.cache[key]);
      Object.keys(require.cache).forEach((key) => {
        if (key.includes('graph/view')) {
          delete require.cache[key];
        }
      });

      const vscodeStub: any = {
        Uri: {
          joinPath: (base: any, ...paths: string[]) => ({ fsPath: [base.fsPath, ...paths].join('/') }),
        },
      };

      moduleAny._load = (request: string, parent: any, isMain: boolean) => {
        if (request === 'vscode') {
          return vscodeStub;
        }
        return restoreLoad(request, parent, isMain);
      };

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { buildDependencyGraphHtml } = require('../../graph/view');
      const webviewStub = {
        cspSource: 'vscode-resource',
        asWebviewUri: (uri: any) => ({ toString: () => `vscode-resource://${uri.fsPath}` }),
      };
      const strings = {
        title: 'Dependency Graph',
        resetView: 'Reset',
        autoLayout: 'Auto layout',
        removeDependencyLabel: 'Remove dependency',
        legendClosed: 'Closed',
        legendInProgress: 'In progress',
        legendOpen: 'Open',
        legendBlocked: 'Blocked',
        emptyTitle: 'Empty',
        emptyDescription: 'Nothing to show',
        renderErrorTitle: 'Oops',
      };
      capturedHtml = buildDependencyGraphHtml(webviewStub as any, strings as any, 'en', true, { fsPath: '/ext' } as any);
    });

    after(() => {
      const moduleAny = Module as any;
      moduleAny._load = restoreLoad;
      vscodeCacheKeys.forEach(key => delete require.cache[key]);
    });

    it('enforces strict CSP with nonce and cspSource', () => {
      assert.ok(capturedHtml.includes('Content-Security-Policy'), 'missing CSP meta');
      assert.ok(capturedHtml.includes('vscode-resource'), 'webview.cspSource missing');
      assert.ok(/default-src 'none'/.test(capturedHtml), 'default-src not none');
      assert.ok(/script-src 'nonce-/.test(capturedHtml), 'nonce missing from script-src');
      assert.ok(!/unsafe-inline/.test(capturedHtml), 'CSP allows unsafe-inline');
      assert.ok(!/unsafe-eval/.test(capturedHtml), 'CSP allows unsafe-eval');
    });

    it('only uses nonced external scripts and no inline handlers', () => {
      const scriptTags = capturedHtml.match(/<script[^>]*>/g) || [];
      assert.strictEqual(scriptTags.length, 1, 'expected single script tag');
      assert.ok(/nonce=/.test(scriptTags[0]), 'script tag missing nonce');
      assert.ok(/src=/.test(scriptTags[0]), 'script tag missing src');
      assert.ok(!/\son\w+=/i.test(capturedHtml), 'inline event handler present');
    });

    it('uses nonced style blocks', () => {
      const styleTags = capturedHtml.match(/<style[^>]*>/g) || [];
      assert.strictEqual(styleTags.length, 1, 'expected single style tag');
      assert.ok(/nonce=/.test(styleTags[0]), 'style tag missing nonce');
    });
  });
});
