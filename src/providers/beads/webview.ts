import * as vscode from 'vscode';
import { BeadItemData, toViewModel } from '../../utils/beads';
import { WebviewCommand } from '../../views/issues/types';
import { buildCodiconLink } from '../../views/shared/assets';
import { CMD_OPEN_BEAD, CMD_OPEN_IN_PROGRESS_PANEL, CMD_PICK_SORT_MODE } from '../../constants/commands';

export interface BeadsDataSource {
  onDidChangeTreeData: vscode.Event<any>;
  getVisibleBeads(): BeadItemData[];
  getSortMode(): string;
}

export class BeadsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'beady.issuesView';
  private static readonly allowedCommands = new Set<WebviewCommand['command']>([
    'open',
    'openInProgressPanel',
    'pickSort',
    'ready',
  ]);

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
    webviewView.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
      const message = this._parseWebviewCommand(rawMessage);
      if (!message) {
        return;
      }

      switch (message.command) {
        case 'open': {
          const item = this._dataSource.getVisibleBeads().find(b => b.id === message.id);
          if (item) {
            vscode.commands.executeCommand(CMD_OPEN_BEAD, item);
          }
          break;
        }
        case 'openInProgressPanel': {
          vscode.commands.executeCommand(CMD_OPEN_IN_PROGRESS_PANEL);
          break;
        }
        case 'pickSort': {
          vscode.commands.executeCommand(CMD_PICK_SORT_MODE);
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
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'views', 'issues.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'views', 'issues.css'));

    const nonce = getNonce();

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `style-src ${webview.cspSource} https: 'nonce-${nonce}'`,
      `font-src ${webview.cspSource} https: data:`,
      "connect-src 'none'",
      "frame-src 'none'"
    ].join('; ');

    const densityClass = density === 'compact' ? ' class="compact"' : '';

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="${csp}">
      <link href="${styleUri}" rel="stylesheet" nonce="${nonce}">
      ${buildCodiconLink()}
      <title>Beads Issues</title>
    </head>
    <body${densityClass}>
      <div id="root">Loading...</div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }

  private _parseWebviewCommand(raw: unknown): WebviewCommand | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.command !== 'string' || !BeadsWebviewProvider.allowedCommands.has(candidate.command as WebviewCommand['command'])) {
      return undefined;
    }

    if (candidate.command === 'open' && typeof candidate.id !== 'string') {
      return undefined;
    }

    return candidate as WebviewCommand;
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
