import * as assert from 'assert';
import Module = require('module');

describe('issues webview CSP', () => {
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
      onDidChangeTreeData: (fn: any) => ({ dispose: () => undefined }),
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

  it('sets strict CSP without unsafe inline/eval', () => {
    assert.ok(capturedHtml.includes('Content-Security-Policy'), 'missing CSP meta');
    assert.ok(!/unsafe-inline/.test(capturedHtml), 'CSP allows unsafe-inline');
    assert.ok(!/unsafe-eval/.test(capturedHtml), 'CSP allows unsafe-eval');
    assert.ok(/default-src 'none'/.test(capturedHtml), 'default-src not none');
    assert.ok(/script-src 'nonce-/.test(capturedHtml), 'nonce missing from script-src');
  });

  it('loads bundle with nonce and no inline scripts', () => {
    const scriptTags = capturedHtml.match(/<script[^>]*>/g) || [];
    assert.strictEqual(scriptTags.length, 1, 'expected single external script tag');
    assert.ok(/nonce=/.test(scriptTags[0]), 'script tag missing nonce');
  });
});
