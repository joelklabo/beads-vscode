import * as vscode from 'vscode';
import { BeadItemData, toViewModel } from '../../utils/beads';
import { WebviewCommand } from '../../views/issues/types';

export interface BeadsDataSource {
  onDidChangeTreeData: vscode.Event<any>;
  getVisibleBeads(): BeadItemData[];
  getSortMode(): string;
}

export class BeadsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'beady.issuesView';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _dataSource: BeadsDataSource,
    private readonly _getDensity?: () => 'default' | 'compact'
  ) { }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri
      ]
    };

    const initialDensity = this._getDensity ? this._getDensity() : 'default';
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, initialDensity);

    // Listen for data changes
    this._dataSource.onDidChangeTreeData(() => {
      this._updateWebview();
    });

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message: WebviewCommand) => {
      switch (message.command) {
        case 'open': {
          // We need to find the full item to pass to the command, or the command needs to handle ID
          // beady.openBead expects BeadItemData.
          // Let's find it from the data source.
          const item = this._dataSource.getVisibleBeads().find(b => b.id === message.id);
          if (item) {
            vscode.commands.executeCommand('beady.openBead', item);
          }
          break;
        }
        case 'log': {
          console.log('[Webview]', message.text);
          break;
        }
        case 'pickSort': {
          vscode.commands.executeCommand('beady.pickSortMode');
          break;
        }
        case 'ready': {
          this._updateWebview();
          break;
        }
      }
    });

    // Initial update
    this._updateWebview();
  }

  private _updateWebview() {
    if (!this._view) { return; }
    const beads = this._dataSource.getVisibleBeads();
    const viewModels = beads.map(toViewModel);
    
    this._view.webview.postMessage({
      type: 'update',
      beads: viewModels,
      sortMode: this._dataSource.getSortMode(),
      density: this._getDensity ? this._getDensity() : 'default'
    } as any);
  }

  private _getHtmlForWebview(webview: vscode.Webview, density: 'default' | 'compact') {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // We assume the build process will output the react app to `out/views/issues/index.js` or similar.
    // For now, we'll just use a placeholder script or assume it's there.
    // Since the React task is separate, I will just put a placeholder script tag.
    
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'views', 'issues.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'views', 'issues.css'));

    const nonce = getNonce();

    const densityClass = density === 'compact' ? 'class="compact"' : '';

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';">
      <link href="${styleUri}" rel="stylesheet">
      <title>Beads Issues</title>
    </head>
    <body ${densityClass}>
      <div id="root">Loading... (CSP Relaxed)</div>
      <script nonce="${nonce}">
        console.log('Inline script starting');
        try {
          window.vscode = acquireVsCodeApi();
          console.log('VS Code API acquired');
          window.addEventListener('error', event => {
              console.error('Global error:', event.message);
              window.vscode.postMessage({ command: 'log', text: 'ERROR: ' + event.message });
          });
        } catch (e) {
          console.error('Failed to acquire VS Code API:', e);
        }
      </script>
      <script nonce="${nonce}" src="${scriptUri}" onload="console.log('Bundle loaded')" onerror="console.error('Bundle failed to load')"></script>
    </body>
    </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
