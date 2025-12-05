import { escapeHtml } from '../utils';
import { DependencyTreeStrings, GraphEdgeData, GraphNodeData } from '../utils/graph';

function stringify(data: unknown): string {
  return JSON.stringify(data);
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
        .edge.blocks { stroke: #f14c4c; stroke-width: 2.5; }
        .edge.selected { stroke: var(--vscode-focusBorder, #007acc); stroke-width: 3; }

        .controls { position: fixed; top: 20px; right: 20px; display: flex; gap: 8px; align-items: center; }
        .control-button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; }
        .control-button:hover { background-color: var(--vscode-button-hoverBackground); }
        .hint-text { font-size: 12px; color: var(--vscode-descriptionForeground); }

        .legend { position: fixed; bottom: 20px; right: 20px; background-color: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; font-size: 11px; }
        .legend-item { display: flex; align-items: center; margin-bottom: 6px; }
        .legend-item:last-child { margin-bottom: 0; }

        #contextMenu { position: absolute; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-focusBorder); border-radius: 4px; padding: 6px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 2000; display: none; min-width: 180px; }
        #contextMenu button { background: transparent; color: var(--vscode-foreground); border: none; padding: 6px 12px; width: 100%; text-align: left; cursor: pointer; font-size: 12px; }
        #contextMenu button:hover { background: var(--vscode-list-hoverBackground); }

        #toast { position: fixed; bottom: 24px; left: 24px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px 12px; color: var(--vscode-foreground); box-shadow: 0 2px 8px rgba(0,0,0,0.2); display: none; z-index: 2100; font-size: 12px; }
    </style>
</head>
<body>
    <div class="controls">
        <button class="control-button" onclick="resetZoom()">${escapeHtml(strings.resetView)}</button>
        <button class="control-button" onclick="autoLayout()">${escapeHtml(strings.autoLayout)}</button>
        ${dependencyEditingEnabled ? `<button class="control-button" id="removeEdgeButton">${escapeHtml(strings.removeDependencyLabel)}</button>` : ''}
        ${dependencyEditingEnabled ? `<span class="hint-text" id="linkHint">Shift+Click a node or press A to start linking</span>` : ''}
    </div>

    <div class="legend">
        <div class="legend-item"><span class="status-indicator closed"></span><span>${escapeHtml(strings.legendClosed)}</span></div>
        <div class="legend-item"><span class="status-indicator in_progress"></span><span>${escapeHtml(strings.legendInProgress)}</span></div>
        <div class="legend-item"><span class="status-indicator open"></span><span>${escapeHtml(strings.legendOpen)}</span></div>
        <div class="legend-item"><span class="status-indicator blocked"></span><span>${escapeHtml(strings.legendBlocked)}</span></div>
    </div>

    <div id="toast"></div>
    <div id="contextMenu"></div>

    <div id="container">
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

        function hideContextMenu() { contextMenu.style.display = 'none'; }

        function showContextMenu(x, y, nodeId) {
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
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        });

        let draggedNode = null;
        let draggedNodeId = null;
        let dragOffset = {x: 0, y: 0};
        let isDragging = false;
        let mouseDownPos = null;

        function calculateLayout() {
            const levels = new Map();
            const visited = new Set();
            const outDegree = new Map();

            nodes.forEach(node => outDegree.set(node.id, 0));
            edges.forEach(edge => { outDegree.set(edge.sourceId, (outDegree.get(edge.sourceId) || 0) + 1); });

            const leaves = nodes.filter(node => outDegree.get(node.id) === 0);
            if (leaves.length === 0) {
                const minOutDegree = Math.min(...Array.from(outDegree.values()));
                leaves.push(...nodes.filter(node => outDegree.get(node.id) === minOutDegree));
            }

            const queue = leaves.map(node => ({node, level: 0}));
            leaves.forEach(node => visited.add(node.id));

            while (queue.length > 0) {
                const {node, level} = queue.shift();
                if (!levels.has(level)) { levels.set(level, []); }
                levels.get(level).push(node);

                const parents = edges
                    .filter(edge => edge.targetId === node.id)
                    .map(edge => nodes.find(n => n.id === edge.sourceId))
                    .filter(n => n && !visited.has(n.id));

                parents.forEach(parent => {
                    visited.add(parent.id);
                    queue.push({node: parent, level: level + 1});
                });
            }

            nodes.forEach(node => {
                if (!visited.has(node.id)) {
                    const maxLevel = Math.max(...Array.from(levels.keys()), -1);
                    const level = maxLevel + 1;
                    if (!levels.has(level)) { levels.set(level, []); }
                    levels.get(level).push(node);
                }
            });

            const horizontalSpacing = 250;
            const verticalSpacing = 120;
            const startX = 100;
            const startY = 100;

            levels.forEach((nodesInLevel, level) => {
                const sortedNodes = nodesInLevel.sort((a, b) => {
                    const numA = parseInt(a.id.match(/\d+/)?.[0] || '0', 10);
                    const numB = parseInt(b.id.match(/\d+/)?.[0] || '0', 10);
                    return numA - numB;
                });

                sortedNodes.forEach((node, index) => {
                    if (savedPositions[node.id]) {
                        nodePositions.set(node.id, savedPositions[node.id]);
                    } else {
                        const x = startX + (index * horizontalSpacing);
                        const y = startY + (level * verticalSpacing);
                        nodePositions.set(node.id, {x, y});
                    }
                });
            });
        }

        function savePositions() {
            const positions = {};
            nodePositions.forEach((pos, id) => { positions[id] = pos; });
            savedPositions = positions;
            vscode.setState({ nodePositions: positions, lastSelectedNodeId });
        }

        function createNode(node) {
            const div = document.createElement('div');
            div.className = 'node status-' + node.status;
            div.innerHTML = '<div class="node-id">' + '<span class="status-indicator ' + node.status + '"></span>' + node.id + '</div>' +
                '<div class="node-title" title="' + node.title + '">' + node.title + '</div>';
            div.dataset.nodeId = node.id;

            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e.pageX, e.pageY, node.id);
            });

            div.addEventListener('mousedown', (e) => {
                if (dependencyEditingEnabled && e.button === 2) {
                    linkSourceId = node.id;
                    linkingDrag = true;
                    updateHint('Drag to a target to link from ' + node.id);
                    e.preventDefault();
                    return;
                }
                if (e.button !== 0) return;
                draggedNode = div;
                draggedNodeId = node.id;
                mouseDownPos = {x: e.clientX, y: e.clientY};
                const pos = nodePositions.get(node.id);
                dragOffset.x = e.clientX - pos.x;
                dragOffset.y = e.clientY - pos.y;
                e.preventDefault();
            });

            div.addEventListener('mouseup', (e) => {
                if (linkingDrag && linkSourceId && linkSourceId !== node.id) {
                    attemptAddDependency(linkSourceId, node.id);
                }
                linkingDrag = false;
            });

            div.addEventListener('click', (e) => {
                if (isDragging) { return; }
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
                selectedEdge = null;
                lastSelectedNodeId = node.id;
                vscode.setState({ nodePositions: savedPositions, lastSelectedNodeId });
                vscode.postMessage({ command: 'openBead', beadId: node.id });
            });

            return div;
        }

        function drawEdge(from, to, type) {
            const fromPos = nodePositions.get(from);
            const toPos = nodePositions.get(to);
            if (!fromPos || !toPos) return '';
            const fromEl = nodeElements.get(from);
            const toEl = nodeElements.get(to);
            if (!fromEl || !toEl) return '';

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const x1 = fromPos.x + (fromRect.width / 2);
            const y1 = fromPos.y + fromRect.height;
            const x2 = toPos.x + (toRect.width / 2);
            const y2 = toPos.y;
            const midY = (y1 + y2) / 2;
            const path = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2;
            return '<path d="' + path + '" class="edge ' + (type || '') + '" data-from="' + from + '" data-to="' + to + '" />';
        }

        function render() {
            const canvas = document.getElementById('canvas');
            const svg = document.getElementById('svg');
            canvas.innerHTML = '';
            nodeElements.clear();
            calculateLayout();

            nodes.forEach(node => {
                const div = createNode(node);
                const pos = nodePositions.get(node.id);
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

            svg.setAttribute('width', maxX);
            svg.setAttribute('height', maxY);
            canvas.style.width = maxX + 'px';
            canvas.style.height = maxY + 'px';

            setTimeout(() => {
                const edgePaths = edges.map(edge => drawEdge(edge.sourceId, edge.targetId, edge.type)).join('');
                svg.innerHTML = '<defs>' +
                    '<marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">' +
                    '<polygon points="0 0, 10 3, 0 6" fill="var(--vscode-panel-border)" />' +
                    '</marker>' +
                    '</defs>' + edgePaths;
                bindEdgeClicks();
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

        function redrawEdges() {
            const svg = document.getElementById('svg');
            const edgePaths = edges.map(edge => drawEdge(edge.sourceId, edge.targetId, edge.type)).join('');
            svg.innerHTML = '<defs>' +
                '<marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">' +
                '<polygon points="0 0, 10 3, 0 6" fill="var(--vscode-panel-border)" />' +
                '</marker>' +
                '</defs>' + edgePaths;
            bindEdgeClicks();
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
