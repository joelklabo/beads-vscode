import * as vscode from 'vscode';
import { escapeHtml } from '../utils';
import { buildSharedStyles } from '../views/shared/theme';
import { buildCodiconLink } from '../views/shared/assets';
import { DependencyTreeStrings } from '../utils/graph';

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function buildDependencyGraphHtml(
  webview: vscode.Webview,
  strings: DependencyTreeStrings,
  locale: string,
  dependencyEditingEnabled: boolean,
  extensionUri: vscode.Uri,
): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'views', 'graph.js'));
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

  const removeDependencyButton = dependencyEditingEnabled
    ? `<button class="control-button" id="removeEdgeButton" aria-label="${escapeHtml(strings.removeDependencyLabel)}">${escapeHtml(strings.removeDependencyLabel)}</button>`
    : '';
  const linkHint = dependencyEditingEnabled
    ? `<span class="hint-text" id="linkHint" role="status" aria-live="polite">Shift+Click a node or press A to start linking</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>${escapeHtml(strings.title)}</title>
  ${buildCodiconLink()}
  <style nonce="${nonce}">
    ${buildSharedStyles()}
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      margin: 0;
      padding: 20px;
      overflow: hidden;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    #container {
      width: 100%;
      height: calc(100vh - 60px);
      position: relative;
      overflow: auto;
    }
    #canvas {
      position: absolute;
      top: 0;
      left: 0;
      min-width: 100%;
      min-height: 100%;
      z-index: 10;
    }
    .node {
      position: absolute;
      padding: 12px 16px;
      border-radius: 8px;
      border: 2px solid;
      background-color: #1e1e1e;
      cursor: move;
      min-width: 120px;
      text-align: center;
      transition: box-shadow 0.2s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      z-index: 10;
      user-select: none;
    }
    .node:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); z-index: 20; }
    .node:focus-visible { outline: 2px solid var(--vscode-focusBorder, #007acc); outline-offset: 4px; }
    .node.dragging { opacity: 0.8; z-index: 1000; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4); }
    .node.status-closed { border-color: #73c991; background-color: #1e1e1e; }
    .node.status-in_progress { border-color: #f9c513; background-color: #1e1e1e; }
    .node.status-open { border-color: #ff8c00; background-color: #1e1e1e; }
    .node.status-blocked { border-color: #f14c4c; background-color: #2d1a1a; color: #f14c4c; }
    .node-id { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .node-title { font-size: 11px; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
    .node.status-blocked .node-title { color: #f14c4c; opacity: 0.9; }
    .node-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
    .node .bead-chip { background: #1e1e1e; padding: 2px 8px; }
    .status-indicator { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
    .status-indicator.closed { background-color: #73c991; }
    .status-indicator.in_progress { background-color: #f9c513; }
    .status-indicator.open { background-color: #ff8c00; }
    .status-indicator.blocked { background-color: #f14c4c; }
    svg { position: absolute; top: 0; left: 0; pointer-events: auto; z-index: 0; }
    .edge { stroke: var(--vscode-panel-border); stroke-width: 2; fill: none; marker-end: url(#arrowhead); opacity: 0.8; cursor: pointer; }
    .edge.blocks { stroke: #f14c4c; stroke-width: 2.5; stroke-dasharray: 6 3; }
    .edge.selected { stroke: var(--vscode-focusBorder, #007acc); stroke-width: 3; }
    .edge-label { fill: var(--vscode-descriptionForeground); font-size: 11px; pointer-events: none; user-select: none; }
    .controls { position: fixed; top: 20px; right: 20px; display: flex; gap: 8px; align-items: center; }
    .control-button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; }
    .control-button:hover { background-color: var(--vscode-button-hoverBackground); }
    .hint-text { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .legend { position: fixed; bottom: 20px; right: 20px; background-color: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; font-size: 11px; }
    .legend-item { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .legend-item:last-child { margin-bottom: 0; }
    .legend-arrow { font-weight: 600; }
    .empty-state { padding: 40px; text-align: center; color: var(--vscode-descriptionForeground); }
    .empty-state.error { color: var(--vscode-errorForeground); }
    #contextMenu { position: absolute; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-focusBorder); border-radius: 4px; padding: 6px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 2000; display: none; min-width: 180px; }
    #contextMenu button { background: transparent; color: var(--vscode-foreground); border: none; padding: 6px 12px; width: 100%; text-align: left; cursor: pointer; font-size: 12px; }
    #contextMenu button:hover { background: var(--vscode-list-hoverBackground); }
    #toast { position: fixed; bottom: 24px; left: 24px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px 12px; color: var(--vscode-foreground); box-shadow: 0 2px 8px rgba(0,0,0,0.2); display: none; z-index: 2100; font-size: 12px; }
    @media (forced-colors: active) {
      .node { border: 1px solid CanvasText; background: Canvas; color: CanvasText; }
      .node.status-blocked { border-style: dashed; }
      .node.status-in_progress { border-style: dotted; }
      .edge { stroke: CanvasText; }
      .edge.blocks { stroke-dasharray: 6 3; }
      .edge.selected { stroke: CanvasText; }
      .control-button { border: 1px solid CanvasText; }
      #contextMenu { border-color: CanvasText; }
    }
  </style>
</head>
<body>
  <div class="controls">
    <button class="control-button" id="resetViewButton" aria-label="${escapeHtml(strings.resetView)}">${escapeHtml(strings.resetView)}</button>
    <button class="control-button" id="autoLayoutButton" aria-label="${escapeHtml(strings.autoLayout)}">${escapeHtml(strings.autoLayout)}</button>
    ${removeDependencyButton}
    ${linkHint}
  </div>

  <div class="legend" aria-label="${escapeHtml(strings.title)} legend">
    <div class="legend-item"><span class="status-indicator closed" aria-hidden="true"></span><span>${escapeHtml(strings.legendClosed)}</span></div>
    <div class="legend-item"><span class="status-indicator in_progress" aria-hidden="true"></span><span>${escapeHtml(strings.legendInProgress)}</span></div>
    <div class="legend-item"><span class="status-indicator open" aria-hidden="true"></span><span>${escapeHtml(strings.legendOpen)}</span></div>
    <div class="legend-item"><span class="status-indicator blocked" aria-hidden="true"></span><span>${escapeHtml(strings.legendBlocked)}</span></div>
    <div class="legend-item"><span class="legend-arrow" aria-hidden="true">→</span><span>Edges read as source → target (arrowhead points to dependency)</span></div>
  </div>

  <div id="toast" role="status" aria-live="polite"></div>
  <div id="contextMenu"></div>

  <div id="container" aria-label="${escapeHtml(strings.title)} graph" role="application">
    <svg id="svg"></svg>
    <div id="canvas"></div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
