import * as vscode from 'vscode';

export class BeadsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'beady.issuesView';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
  }

  private _getHtmlForWebview(_webview: vscode.Webview) {
    // Placeholder for now
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Beads Issues</title>
      <style>
        body { font-family: var(--vscode-font-family); padding: 10px; }
      </style>
    </head>
    <body>
      <h2>Beads Issues</h2>
      <p>Loading...</p>
    </body>
    </html>`;
  }
}
