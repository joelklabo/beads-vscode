import type { GraphEdgeData, GraphNodeData } from '../../utils/graph';

declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

type GraphLocalized = {
  emptyTitle: string;
  emptyDescription: string;
  renderErrorTitle: string;
};

type GraphMessage =
  | { type: 'init'; payload: GraphPayload }
  | { type: 'update'; payload: GraphPayload };

type GraphNode = GraphNodeData & { issueType?: string; status?: string; title?: string };

type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdgeData[];
  dependencyEditingEnabled: boolean;
  localized: GraphLocalized;
};

const vscode = acquireVsCodeApi();

let nodes: GraphNode[] = [];
let edges: GraphEdgeData[] = [];
let dependencyEditingEnabled = false;
let localized: GraphLocalized = {
  emptyTitle: 'No beads found',
  emptyDescription: 'The visualizer received 0 nodes.',
  renderErrorTitle: 'Render Error',
};

let savedPositions: Record<string, { x: number; y: number }> = {};
let lastSelectedNodeId: string | undefined;
let selectedEdge: { from?: string | null; to?: string | null } | null = null;
let linkSourceId: string | null = null;
let draggedNode: HTMLDivElement | null = null;
let draggedNodeId: string | null = null;
const dragOffset = { x: 0, y: 0 };
let isDragging = false;
let mouseDownPos: { x: number; y: number } | null = null;

const nodeElements = new Map<string, HTMLDivElement>();
const nodePositions = new Map<string, { x: number; y: number }>();
let incomingCounts = new Map<string, number>();
let outgoingCounts = new Map<string, number>();

let linkHint: HTMLElement | null = null;
let contextMenu: HTMLElement | null = null;
let toast: HTMLElement | null = null;
let removeEdgeButton: HTMLElement | null = null;
let resetViewButton: HTMLElement | null = null;
let autoLayoutButton: HTMLElement | null = null;
let svgEl: SVGSVGElement | null = null;
let canvasEl: HTMLElement | null = null;
let containerEl: HTMLElement | null = null;

const typeIconMap: Record<string, string> = {
  epic: 'codicon-milestone',
  feature: 'codicon-sparkle',
  bug: 'codicon-bug',
  task: 'codicon-check',
  chore: 'codicon-tools'
};

let domReady = false;
let pendingPayload: GraphPayload | null = null;
let listenersAttached = false;

function restoreState() {
  const state = vscode.getState() || {};
  savedPositions = state.nodePositions || {};
  lastSelectedNodeId = state.lastSelectedNodeId;
}

function persistState() {
  const positions: Record<string, { x: number; y: number }> = {};
  nodePositions.forEach((pos, id) => { positions[id] = pos; });
  savedPositions = positions;
  vscode.setState({ nodePositions: positions, lastSelectedNodeId });
}

function applyPayload(payload: GraphPayload) {
  nodes = payload.nodes || [];
  edges = payload.edges || [];
  dependencyEditingEnabled = !!payload.dependencyEditingEnabled;
  localized = payload.localized || localized;

  incomingCounts = new Map();
  outgoingCounts = new Map();
  edges.forEach((edge) => {
    outgoingCounts.set(edge.sourceId, (outgoingCounts.get(edge.sourceId) || 0) + 1);
    incomingCounts.set(edge.targetId, (incomingCounts.get(edge.targetId) || 0) + 1);
  });

  const state = vscode.getState() || {};
  savedPositions = state.nodePositions || savedPositions;
  lastSelectedNodeId = state.lastSelectedNodeId;

  render();
}

function showToast(message: string) {
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast && (toast.style.display = 'none'); }, 2000);
}

function updateHint(text: string) {
  if (linkHint) {
    linkHint.textContent = text;
  }
}

function edgeExists(from: string, to: string) {
  return edges.some((e) => e.sourceId === from && e.targetId === to);
}

function createsCycle(from: string, to: string) {
  const adjacency = new Map<string, Set<string>>();
  const addEdge = (f: string, t: string) => {
    if (!adjacency.has(f)) adjacency.set(f, new Set());
    adjacency.get(f)!.add(t);
  };
  edges.forEach((e) => addEdge(e.sourceId, e.targetId));
  addEdge(from, to);

  const stack = [to];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const nexts = adjacency.get(current);
    nexts?.forEach((n) => { if (!visited.has(n)) stack.push(n); });
  }
  return false;
}

function attemptAddDependency(sourceId: string, targetId: string) {
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
  if (selectedEdge?.from && selectedEdge?.to) {
    vscode.postMessage({ command: 'removeDependency', sourceId: selectedEdge.from, targetId: selectedEdge.to });
    selectedEdge = null;
    return;
  }
  if (lastSelectedNodeId) {
    vscode.postMessage({ command: 'removeDependency', contextId: lastSelectedNodeId });
  }
}

function hideContextMenu() { if (contextMenu) { contextMenu.style.display = 'none'; } }

function showContextMenu(x: number, y: number, nodeId: string) {
  if (!contextMenu) { return; }
  contextMenu.innerHTML = '';
  const makeButton = (label: string, handler: () => void) => {
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
    persistState();
    vscode.postMessage({ command: 'openBead', beadId: nodeId });
  }));

  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.style.display = 'block';
}

function calculateLayout() {
  const adjacency = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!adjacency.has(edge.sourceId)) adjacency.set(edge.sourceId, []);
    adjacency.get(edge.sourceId)!.push(edge.targetId);
  });

  const memo = new Map<string, number>();
  const depth = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const targets = adjacency.get(id) || [];
    const value = targets.length === 0 ? 0 : Math.max(...targets.map(depth)) + 1;
    memo.set(id, value);
    return value;
  };

  nodePositions.clear();
  nodes.forEach((node) => { depth(node.id); });

  const levels = new Map<number, string[]>();
  nodes.forEach((node) => {
    const d = memo.get(node.id) ?? 0;
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d)!.push(node.id);
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
      const saved = savedPositions[id];
      if (saved) {
        nodePositions.set(id, saved);
      }
    }
  });
}

function createNode(node: GraphNode): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'node status-' + (node.status || 'open');
  div.dataset.nodeId = node.id;
  div.setAttribute('role', 'button');
  div.setAttribute('tabindex', '0');

  const outgoing = outgoingCounts.get(node.id) || 0;
  const incoming = incomingCounts.get(node.id) || 0;
  const statusText = node.status || 'open';
  div.setAttribute('aria-label', `${node.id}. ${(node.title || 'Issue')}; status ${statusText}; ${outgoing} downstream, ${incoming} upstream.`);

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

  const chipsRow = document.createElement('div');
  chipsRow.className = 'node-chips';
  const statusChip = document.createElement('div');
  statusChip.className = 'bead-chip status status-' + (node.status || 'open') + (node.status === 'in_progress' ? ' pulsing' : '');
  const statusIcon = document.createElement('span');
  statusIcon.className = 'codicon codicon-circle-filled';
  const statusTextNode = document.createTextNode(node.status || 'open');
  statusChip.appendChild(statusIcon);
  statusChip.appendChild(statusTextNode);
  const typeKey = node.issueType || 'task';
  const typeChip = document.createElement('div');
  typeChip.className = 'bead-chip type type-' + typeKey;
  const typeIcon = document.createElement('span');
  typeIcon.className = 'codicon ' + (typeIconMap[typeKey] || 'codicon-check');
  const typeTextNode = document.createTextNode(typeKey);
  typeChip.appendChild(typeIcon);
  typeChip.appendChild(typeTextNode);
  chipsRow.appendChild(statusChip);
  chipsRow.appendChild(typeChip);
  div.appendChild(chipsRow);

  div.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    draggedNode = div;
    draggedNodeId = node.id;
    mouseDownPos = { x: e.clientX, y: e.clientY };

    const pos = nodePositions.get(node.id);
    if (pos) {
      dragOffset.x = e.clientX - pos.x;
      dragOffset.y = e.clientY - pos.y;
    }
    e.preventDefault();
  });

  const activateNode = () => {
    if (dependencyEditingEnabled && (linkSourceId || (linkHint && linkHint.textContent?.includes('Select a target')))) {
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
    persistState();
    vscode.postMessage({ command: 'openBead', beadId: node.id });
  };

  div.addEventListener('click', (e) => {
    if (isDragging) return;

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

function drawEdge(edge: GraphEdgeData) {
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
  const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', path);
  pathEl.setAttribute('class', 'edge ' + (edge.type || ''));
  pathEl.setAttribute('data-from', edge.sourceId);
  pathEl.setAttribute('data-to', edge.targetId);
  const labelId = 'edge-label-' + (edge.sourceId + '-' + edge.targetId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const description = edge.type ? `${edge.sourceId} ${edge.type} ${edge.targetId}` : `${edge.sourceId} → ${edge.targetId}`;
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
  textEl.textContent = `${edge.sourceId} → ${edge.targetId}${edge.type ? ` (${edge.type})` : ''}`;

  return { pathEl, textEl };
}

function bindEdgeClicks() {
  const edgeEls = Array.from(document.querySelectorAll<SVGPathElement>('path.edge'));
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
        (el as any).click?.() ?? el.dispatchEvent(new Event('click'));
      }
      if (dependencyEditingEnabled && e.key === 'Delete') {
        e.preventDefault();
        attemptRemoveSelected();
      }
    });
  });
}

function paintEdges() {
  if (!svgEl) return;
  while (svgEl!.firstChild) {
    svgEl!.removeChild(svgEl!.firstChild);
  }
  svgEl!.appendChild(buildArrowheadDefs());
  edges.forEach((edge) => {
    const pair = drawEdge(edge);
    if (pair?.pathEl) {
      svgEl!.appendChild(pair.pathEl);
      if (pair.textEl) {
        svgEl!.appendChild(pair.textEl);
      }
    }
  });
  bindEdgeClicks();
}

function render() {
  if (!domReady) {
    pendingPayload = { nodes, edges, dependencyEditingEnabled, localized };
    return;
  }
  if (!canvasEl || !svgEl || !containerEl) return;

  if (!nodes.length) {
    containerEl.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = localized.emptyTitle;
    containerEl.appendChild(empty);
    return;
  }

  canvasEl.replaceChildren();
  nodeElements.clear();
  calculateLayout();

  nodes.forEach((node) => {
    const div = createNode(node);
    const pos = nodePositions.get(node.id) || { x: 40, y: 40 };
    div.style.left = pos.x + 'px';
    div.style.top = pos.y + 'px';
    canvasEl!.appendChild(div);
    nodeElements.set(node.id, div);
  });

  let maxX = 0;
  let maxY = 0;
  nodePositions.forEach(pos => {
    maxX = Math.max(maxX, pos.x + 250);
    maxY = Math.max(maxY, pos.y + 100);
  });

  svgEl!.setAttribute('width', String(maxX));
  svgEl!.setAttribute('height', String(maxY));
  canvasEl.style.width = `${maxX}px`;
  canvasEl.style.height = `${maxY}px`;

  setTimeout(() => paintEdges(), 0);
}

function resetZoom() {
  if (!containerEl) return;
  let minX = Infinity; let minY = Infinity;
  let maxX = -Infinity; let maxY = -Infinity;
  nodePositions.forEach(pos => {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + 250);
    maxY = Math.max(maxY, pos.y + 100);
  });
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const viewportCenterX = containerEl.clientWidth / 2;
  const viewportCenterY = containerEl.clientHeight / 2;
  containerEl.scrollTo({ left: centerX - viewportCenterX, top: centerY - viewportCenterY, behavior: 'smooth' });
}

function autoLayout() {
  vscode.setState({ nodePositions: {} });
  savedPositions = {};
  nodePositions.clear();
  render();
}

function redrawEdges() {
  paintEdges();
}

function attachGlobalHandlers() {
  if (listenersAttached) return;
  listenersAttached = true;

  document.addEventListener('click', (e) => {
    if (contextMenu && !contextMenu.contains(e.target as Node)) {
      hideContextMenu();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!draggedNode || !draggedNodeId || !containerEl) return;
    if (!isDragging && mouseDownPos) {
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        isDragging = true;
        draggedNode.classList.add('dragging');
      }
    }
    if (!isDragging) return;
    const scrollLeft = containerEl.scrollLeft;
    const scrollTop = containerEl.scrollTop;
    const x = e.clientX - dragOffset.x + scrollLeft;
    const y = e.clientY - dragOffset.y + scrollTop;
    nodePositions.set(draggedNodeId, { x, y });
    draggedNode.style.left = x + 'px';
    draggedNode.style.top = y + 'px';
    redrawEdges();
  });

  document.addEventListener('mouseup', () => {
    if (draggedNode) { draggedNode.classList.remove('dragging'); }
    if (isDragging) { persistState(); }
    draggedNode = null;
    draggedNodeId = null;
    mouseDownPos = null;
    isDragging = false;
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
}

function bindControls() {
  resetViewButton = document.getElementById('resetViewButton');
  autoLayoutButton = document.getElementById('autoLayoutButton');
  removeEdgeButton = document.getElementById('removeEdgeButton');
  linkHint = document.getElementById('linkHint');
  contextMenu = document.getElementById('contextMenu');
  toast = document.getElementById('toast');
  svgEl = document.getElementById('svg') as SVGSVGElement | null;
  canvasEl = document.getElementById('canvas');
  containerEl = document.getElementById('container');

  if (resetViewButton) {
    resetViewButton.addEventListener('click', () => resetZoom());
  }
  if (autoLayoutButton) {
    autoLayoutButton.addEventListener('click', () => autoLayout());
  }
  if (removeEdgeButton) {
    removeEdgeButton.addEventListener('click', () => attemptRemoveSelected());
  }
}

function handleMessage(event: MessageEvent<GraphMessage>) {
  if (!event.data || (event.data.type !== 'init' && event.data.type !== 'update')) {
    return;
  }
  const payload = event.data.payload;
  if (!payload) return;
  if (!domReady) {
    pendingPayload = payload;
    return;
  }
  try {
    applyPayload(payload);
  } catch (err: any) {
    if (containerEl) {
      containerEl.replaceChildren();
      const errorDiv = document.createElement('div');
      errorDiv.className = 'empty-state error';
      const message = `${localized.renderErrorTitle}: ${err?.message ?? err}`;
      errorDiv.textContent = message;
      containerEl.appendChild(errorDiv);
    }
  }
}

function boot() {
  domReady = true;
  bindControls();
  attachGlobalHandlers();
  restoreState();
  if (pendingPayload) {
    applyPayload(pendingPayload);
    pendingPayload = null;
  }
}

window.addEventListener('message', handleMessage);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Request initial data from extension
vscode.postMessage({ command: 'ready' });
