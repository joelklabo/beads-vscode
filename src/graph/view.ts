import { escapeHtml } from '../utils';
import { DependencyTreeStrings, GraphEdgeData, GraphNodeData } from '../utils/graph';

function stringify(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\u003c').replace(/>/g, '\u003e');
}

export function buildDependencyGraphHtml(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
  strings: DependencyTreeStrings,
  locale: string,
  dependencyEditingEnabled: boolean
): string {
  const nodesJson = stringify(nodes);
  const edgesJson = stringify(edges);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(strings.title)}</title>
    <style>
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

        .node:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 20;
        }

        .node:focus-visible {
            outline: 2px solid var(--vscode-focusBorder, #007acc);
            outline-offset: 4px;
        }

        .node.dragging {
            opacity: 0.8;
            z-index: 1000;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
        }

        .node.status-closed { border-color: #73c991; background-color: #1e1e1e; }
        .node.status-in_progress { border-color: #f9c513; background-color: #1e1e1e; }
        .node.status-open { border-color: #ff8c00; background-color: #1e1e1e; }
        .node.status-blocked { border-color: #f14c4c; background-color: #2d1a1a; color: #f14c4c; }

        .node-id { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
        .node-title { font-size: 11px; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
        .node.status-blocked .node-title { color: #f14c4c; opacity: 0.9; }

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
        <button class="control-button" aria-label="${escapeHtml(strings.resetView)}" onclick="resetZoom()">${escapeHtml(strings.resetView)}</button>
        <button class="control-button" aria-label="${escapeHtml(strings.autoLayout)}" onclick="autoLayout()">${escapeHtml(strings.autoLayout)}</button>
        ${dependencyEditingEnabled ? `<button class="control-button" aria-label="${escapeHtml(strings.removeDependencyLabel)}" id="removeEdgeButton">${escapeHtml(strings.removeDependencyLabel)}</button>` : ''}
        ${dependencyEditingEnabled ? `<span class="hint-text" id="linkHint" role="status" aria-live="polite">Shift+Click a node or press A to start linking</span>` : ''}
    </div>

    <div class="legend" aria-label="${escapeHtml(strings.title)} legend">
        <div class="legend-item"><span class="status-indicator closed" aria-hidden="true"></span><span>${escapeHtml(strings.legendClosed)}</span></div>
        <div class="legend-item"><span class="status-indicator in_progress" aria-hidden="true"></span><span>${escapeHtml(strings.legendInProgress)}</span></div>
        <div class="legend-item"><span class="status-indicator open" aria-hidden="true"></span><span>${escapeHtml(strings.legendOpen)}</span></div>
        <div class="legend-item"><span class="status-indicator blocked" aria-hidden="true"></span><span>${escapeHtml(strings.legendBlocked)}</span></div>
        <div class="legend-item"><span aria-hidden="true" style="font-weight:600;">→</span><span>Edges read as source → target (arrowhead points to dependency)</span></div>
    </div>

    <div id="toast" role="status" aria-live="polite"></div>
    <div id="contextMenu"></div>

    <div id="container" aria-label="${escapeHtml(strings.title)} graph" role="application">
        <svg id="svg"></svg>
        <div id="canvas"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const nodes = ${nodesJson};
        const edges = ${edgesJson};
        const dependencyEditingEnabled = ${dependencyEditingEnabled ? 'true' : 'false'};
        const localized = ${JSON.stringify({
          emptyTitle: strings.emptyTitle,
          emptyDescription: strings.emptyDescription,
          renderErrorTitle: strings.renderErrorTitle,
        })};

        if (!nodes.length) {
            document.body.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--vscode-errorForeground);"><h2>' + localized.emptyTitle + '</h2><p>' + localized.emptyDescription + '</p></div>';
        }

        const nodeElements = new Map();
        const nodePositions = new Map();
        const incomingCounts = new Map();
        const outgoingCounts = new Map();

        edges.forEach((edge) => {
            outgoingCounts.set(edge.sourceId, (outgoingCounts.get(edge.sourceId) || 0) + 1);
            incomingCounts.set(edge.targetId, (incomingCounts.get(edge.targetId) || 0) + 1);
        });

        const previousState = vscode.getState() || {};
        let savedPositions = previousState.nodePositions || {};
        let lastSelectedNodeId = previousState.lastSelectedNodeId;
        let selectedEdge = null;
        let linkSourceId = null;
        let linkingDrag = false;
        const linkHint = document.getElementById('linkHint');
        const contextMenu = document.getElementById('contextMenu');
        const toast = document.getElementById('toast');

        const removeEdgeButton = document.getElementById('removeEdgeButton');
        if (removeEdgeButton) {
            removeEdgeButton.addEventListener('click', () => attemptRemoveSelected());
        }

        function showToast(message) {
            if (!toast) return;
            toast.textContent = message;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 2000);
        }

        function updateHint(text) {
            if (linkHint) {
                linkHint.textContent = text;
            }
        }

        function edgeExists(from, to) {
            return edges.some((e) => e.sourceId === from && e.targetId === to);
        }

        function createsCycle(from, to) {
            const adjacency = new Map();
            const addEdge = (f, t) => {
                if (!adjacency.has(f)) adjacency.set(f, new Set());
                adjacency.get(f).add(t);
            };
            edges.forEach((e) => addEdge(e.sourceId, e.targetId));
            addEdge(from, to);

            const stack = [to];
            const visited = new Set();
            while (stack.length) {
                const current = stack.pop();
                if (current === from) return true;
                if (visited.has(current)) continue;
                visited.add(current);
                const n = adjacency.get(current);
                if (n) {
                    n.forEach((next) => { if (!visited.has(next)) stack.push(next); });
                }
            }
            return false;
        }

        function attemptAddDependency(sourceId, targetId) {
            if (!dependencyEditingEnabled) return;
            if (edgeExists(sourceId, targetId)) {
                showToast('Dependency already exists');
                return;
            }
            if (createsCycle(sourceId, targetId)) {
                showToast('Adding this dependency would create a cycle');
                return;
            }
            vscode.postMessage({ command: 'addDependency', sourceId, targetId });
            linkSourceId = null;
            updateHint('Shift+Click a node or press A to start linking');
        }

        function attemptRemoveSelected() {
            if (!dependencyEditingEnabled) return;
            if (selectedEdge) {
                vscode.postMessage({ command: 'removeDependency', sourceId: selectedEdge.from, targetId: selectedEdge.to });
                selectedEdge = null;
                return;
            }
            if (lastSelectedNodeId) {
                vscode.postMessage({ command: 'removeDependency', contextId: lastSelectedNodeId });
            }
        }

        function hideContextMenu() { if (contextMenu) { contextMenu.style.display = 'none'; } }

        function showContextMenu(x, y, nodeId) {
            if (!contextMenu) { return; }
            contextMenu.innerHTML = '';
            const makeButton = (label, handler) => {
                const btn = document.createElement('button');
                btn.textContent = label;
                btn.addEventListener('click', () => { handler(); hideContextMenu(); });
                return btn;
            };

            if (dependencyEditingEnabled) {
                contextMenu.appendChild(makeButton('Add dependency from here', () => {
                    linkSourceId = nodeId;
                    updateHint('Select a target for ' + nodeId);
                }));
                contextMenu.appendChild(makeButton('Remove dependency…', () => {
                    vscode.postMessage({ command: 'removeDependency', contextId: nodeId });
                }));
            }
            contextMenu.appendChild(makeButton('Open issue', () => {
                lastSelectedNodeId = nodeId;
                vscode.postMessage({ command: 'openBead', beadId: nodeId });
            }));

            contextMenu.style.left = x + 'px';
            contextMenu.style.top = y + 'px';
            contextMenu.style.display = 'block';
        }

        document.addEventListener('click', (e) => {
            if (contextMenu && !contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        });

        let draggedNode = null;
        let draggedNodeId = null;
        let dragOffset = {x: 0, y: 0};
        let isDragging = false;
        let mouseDownPos = null;

        function calculateLayout() {
            const adjacency = new Map();
            edges.forEach((edge) => {
                if (!adjacency.has(edge.sourceId)) adjacency.set(edge.sourceId, []);
                adjacency.get(edge.sourceId).push(edge.targetId);
            });

            const memo = new Map();
            const depth = (id) => {
                if (memo.has(id)) return memo.get(id);
                const targets = adjacency.get(id) || [];
                const value = targets.length === 0 ? 0 : Math.max(...targets.map(depth)) + 1;
                memo.set(id, value);
                return value;
            };

            nodePositions.clear();
            nodes.forEach((node) => { depth(node.id); });

            const levels = new Map();
            nodes.forEach((node) => {
                const d = memo.get(node.id) ?? 0;
                if (!levels.has(d)) levels.set(d, []);
                levels.get(d).push(node.id);
            });

            const spacingX = 220;
            const spacingY = 140;

            levels.forEach((ids, level) => {
                ids.forEach((id, index) => {
                    const saved = savedPositions[id];
                    const x = saved?.x ?? index * spacingX + 40;
                    const y = saved?.y ?? level * spacingY + 20;
                    nodePositions.set(id, { x, y });
                });
            });

            Object.keys(savedPositions || {}).forEach((id) => {
                if (!nodePositions.has(id)) {
                    nodePositions.set(id, savedPositions[id]);
                }
            });
        }

        function createNode(node) {
            const div = document.createElement('div');
            div.className = 'node status-' + (node.status || 'open');
            div.dataset.nodeId = node.id;
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');

            const outgoing = outgoingCounts.get(node.id) || 0;
            const incoming = incomingCounts.get(node.id) || 0;
            const statusText = node.status || 'open';
            div.setAttribute('aria-label', node.id + '. ' + (node.title || 'Issue') + '; status ' + statusText + '; ' + outgoing + ' downstream, ' + incoming + ' upstream.');

            const idRow = document.createElement('div');
            idRow.className = 'node-id';

            const statusIndicator = document.createElement('span');
            statusIndicator.className = 'status-indicator ' + (node.status || 'open');
            statusIndicator.setAttribute('aria-hidden', 'true');

            const idText = document.createElement('span');
            idText.textContent = node.id;

            idRow.appendChild(statusIndicator);
            idRow.appendChild(idText);

            const titleRow = document.createElement('div');
            titleRow.className = 'node-title';
            titleRow.title = node.title || '';
            titleRow.textContent = node.title || '';

            const statusLabel = document.createElement('div');
            statusLabel.className = 'node-status-label sr-only';
            statusLabel.textContent = statusText;

            div.appendChild(idRow);
            div.appendChild(titleRow);
            div.appendChild(statusLabel);

            div.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                draggedNode = div;
                draggedNodeId = node.id;
                mouseDownPos = {x: e.clientX, y: e.clientY};

                const pos = nodePositions.get(node.id);
                dragOffset.x = e.clientX - pos.x;
                dragOffset.y = e.clientY - pos.y;

                e.preventDefault();
            });

            const activateNode = () => {
                if (dependencyEditingEnabled && (linkSourceId || linkHint && linkHint.textContent?.includes('Select a target'))) {
                    if (!linkSourceId) {
                        linkSourceId = node.id;
                        updateHint('Select a target for ' + node.id);
                    } else if (linkSourceId === node.id) {
                        linkSourceId = null;
                        updateHint('Link cancelled');
                    } else {
                        attemptAddDependency(linkSourceId, node.id);
                    }
                    return;
                }

                selectedEdge = null;
                lastSelectedNodeId = node.id;
                vscode.setState({ nodePositions: savedPositions, lastSelectedNodeId });
                vscode.postMessage({ command: 'openBead', beadId: node.id });
            };

            div.addEventListener('click', (e) => {
                if (isDragging) {
                    return;
                }

                if (dependencyEditingEnabled && (e.shiftKey || linkSourceId)) {
                    if (!linkSourceId) {
                        linkSourceId = node.id;
                        updateHint('Select a target for ' + node.id);
                    } else if (linkSourceId === node.id) {
                        linkSourceId = null;
                        updateHint('Link cancelled');
                    } else {
                        attemptAddDependency(linkSourceId, node.id);
                    }
                    return;
                }

                activateNode();
            });

            div.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateNode();
                }
                if (!dependencyEditingEnabled) return;
                if (e.key.toLowerCase() === 'a') {
                    linkSourceId = node.id;
                    updateHint('Select a target for ' + node.id);
                }
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                    e.preventDefault();
                    const rect = div.getBoundingClientRect();
                    showContextMenu(rect.right, rect.bottom, node.id);
                }
            });

            return div;
        }

        function buildArrowheadDefs() {
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'arrowhead');
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '10');
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '3');
            marker.setAttribute('orient', 'auto');

            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', '0 0, 10 3, 0 6');
            polygon.setAttribute('fill', 'var(--vscode-panel-border)');
            marker.appendChild(polygon);
            defs.appendChild(marker);
            return defs;
        }

        function drawEdge(edge) {
            const fromPos = nodePositions.get(edge.sourceId);
            const toPos = nodePositions.get(edge.targetId);

            if (!fromPos || !toPos) return null;

            const fromEl = nodeElements.get(edge.sourceId);
            const toEl = nodeElements.get(edge.targetId);

            if (!fromEl || !toEl) return null;

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();

            const x1 = fromPos.x + (fromRect.width / 2);
            const y1 = fromPos.y + fromRect.height;
            const x2 = toPos.x + (toRect.width / 2);
            const y2 = toPos.y;

            const midY = (y1 + y2) / 2;
            const path = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2;

            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', path);
            pathEl.setAttribute('class', 'edge ' + (edge.type || ''));
            pathEl.setAttribute('data-from', edge.sourceId);
            pathEl.setAttribute('data-to', edge.targetId);
            const labelId = 'edge-label-' + (edge.sourceId + '-' + edge.targetId).replace(/[^a-zA-Z0-9_-]/g, '_');
            const description = edge.type ? edge.sourceId + ' ' + edge.type + ' ' + edge.targetId : edge.sourceId + ' → ' + edge.targetId;
            pathEl.setAttribute('tabindex', dependencyEditingEnabled ? '0' : '-1');
            pathEl.setAttribute('role', 'button');
            pathEl.setAttribute('aria-labelledby', labelId);
            pathEl.setAttribute('aria-label', description);

            const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textEl.setAttribute('id', labelId);
            textEl.setAttribute('class', 'edge-label');
            textEl.setAttribute('x', String((x1 + x2) / 2));
            textEl.setAttribute('y', String(midY - 8));
            textEl.setAttribute('aria-hidden', 'true');
            textEl.textContent = edge.sourceId + ' → ' + edge.targetId + (edge.type ? ' (' + edge.type + ')' : '');

            return { pathEl, textEl };
        }

        function paintEdges(svg) {
            while (svg.firstChild) {
                svg.removeChild(svg.firstChild);
            }
            svg.appendChild(buildArrowheadDefs());
            edges.forEach((edge) => {
                const pair = drawEdge(edge);
                if (pair?.pathEl) {
                    svg.appendChild(pair.pathEl);
                    if (pair.textEl) {
                        svg.appendChild(pair.textEl);
                    }
                }
            });
            bindEdgeClicks();
        }

        function render() {
            const canvas = document.getElementById('canvas');
            const svg = document.getElementById('svg');
            if (!canvas || !svg) return;

            canvas.innerHTML = '';
            nodeElements.clear();

            calculateLayout();

            nodes.forEach((node) => {
                const div = createNode(node);
                const pos = nodePositions.get(node.id) || { x: 40, y: 40 };
                div.style.left = pos.x + 'px';
                div.style.top = pos.y + 'px';
                canvas.appendChild(div);
                nodeElements.set(node.id, div);
            });

            let maxX = 0, maxY = 0;
            nodePositions.forEach(pos => {
                maxX = Math.max(maxX, pos.x + 250);
                maxY = Math.max(maxY, pos.y + 100);
            });

            svg.setAttribute('width', String(maxX));
            svg.setAttribute('height', String(maxY));
            canvas.style.width = maxX + 'px';
            canvas.style.height = maxY + 'px';

            setTimeout(() => {
                paintEdges(svg);
            }, 50);
        }

        function resetZoom() {
            const container = document.getElementById('container');
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            nodePositions.forEach(pos => {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + 250);
                maxY = Math.max(maxY, pos.y + 100);
            });
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const viewportCenterX = container.clientWidth / 2;
            const viewportCenterY = container.clientHeight / 2;
            container.scrollTo({ left: centerX - viewportCenterX, top: centerY - viewportCenterY, behavior: 'smooth' });
        }

        function autoLayout() {
            vscode.setState({ nodePositions: {} });
            savedPositions = {};
            nodePositions.clear();
            render();
        }

        function savePositions() {
            const positions = {};
            nodePositions.forEach((pos, id) => {
                positions[id] = pos;
            });
            savedPositions = positions;
            vscode.setState({ nodePositions: positions, lastSelectedNodeId });
        }

        function redrawEdges() {
            const svg = document.getElementById('svg');
            if (!svg) return;
            paintEdges(svg);
        }

        function bindEdgeClicks() {
            const edgeEls = Array.from(document.querySelectorAll('path.edge'));
            edgeEls.forEach((el) => {
                el.addEventListener('click', () => {
                    edgeEls.forEach((e) => e.classList.remove('selected'));
                    el.classList.add('selected');
                    selectedEdge = { from: el.getAttribute('data-from'), to: el.getAttribute('data-to') };
                });
                el.addEventListener('dblclick', () => {
                    if (dependencyEditingEnabled) {
                        vscode.postMessage({ command: 'removeDependency', sourceId: el.getAttribute('data-from'), targetId: el.getAttribute('data-to') });
                    }
                });
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    selectedEdge = { from: el.getAttribute('data-from'), to: el.getAttribute('data-to') };
                    attemptRemoveSelected();
                });
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        el.click();
                    }
                    if (dependencyEditingEnabled && e.key === 'Delete') {
                        e.preventDefault();
                        attemptRemoveSelected();
                    }
                });
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!draggedNode || !draggedNodeId) return;
            if (!isDragging && mouseDownPos) {
                const dx = e.clientX - mouseDownPos.x;
                const dy = e.clientY - mouseDownPos.y;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    isDragging = true;
                    draggedNode.classList.add('dragging');
                }
            }
            if (!isDragging) return;
            const container = document.getElementById('container');
            const scrollLeft = container.scrollLeft;
            const scrollTop = container.scrollTop;
            const x = e.clientX - dragOffset.x + scrollLeft;
            const y = e.clientY - dragOffset.y + scrollTop;
            nodePositions.set(draggedNodeId, {x, y});
            draggedNode.style.left = x + 'px';
            draggedNode.style.top = y + 'px';
            redrawEdges();
        });

        document.addEventListener('mouseup', () => {
            if (draggedNode) { draggedNode.classList.remove('dragging'); }
            if (isDragging) { savePositions(); }
            draggedNode = null;
            draggedNodeId = null;
            mouseDownPos = null;
            isDragging = false;
            linkingDrag = false;
        });

        document.addEventListener('keydown', (e) => {
            if (!dependencyEditingEnabled) return;
            if (e.key === 'Delete' && selectedEdge) {
                attemptRemoveSelected();
                e.preventDefault();
            }
            if (e.key.toLowerCase() === 'a' && lastSelectedNodeId) {
                linkSourceId = lastSelectedNodeId;
                updateHint('Select a target for ' + linkSourceId);
            }
            if (e.key === 'Escape') {
                linkSourceId = null;
                selectedEdge = null;
                updateHint('Shift+Click a node or press A to start linking');
            }
        });

        try {
            render();
        } catch (err) {
            document.body.innerHTML = '<div style="padding: 40px; color: var(--vscode-errorForeground);"><h2>' + localized.renderErrorTitle + '</h2><pre>' + err.message + '</pre></div>';
        }
    </script>
</body>
</html>`;
}
