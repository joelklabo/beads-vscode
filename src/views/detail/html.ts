import * as vscode from 'vscode';
import { BeadItemData, buildDependencyTrees, sanitizeInlineText, escapeHtml, deriveAssigneeName, linkifyText } from '../../utils';
import { BeadDetailStrings } from './types';
import { getStatusLabel, renderBranchSection } from './utils';

const t = vscode.l10n.t;

export function getBeadDetailHtml(
  item: BeadItemData,
  allItems: BeadItemData[] | undefined,
  webview: vscode.Webview,
  nonce: string,
  strings: BeadDetailStrings,
  locale: string
): string {
  const raw = item.raw as any;
  const description = raw?.description || '';
  const design = raw?.design || '';
  const acceptanceCriteria = raw?.acceptance_criteria || '';
  const notes = raw?.notes || '';
  const issueType = raw?.issue_type || 'task';
  const priority = raw?.priority !== undefined ? raw.priority : 2;
  const createdAt = raw?.created_at ? new Date(raw.created_at).toLocaleString(locale) : '';
  const updatedAt = raw?.updated_at ? new Date(raw.updated_at).toLocaleString(locale) : '';
  const assigneeRaw = deriveAssigneeName(item, strings.assigneeFallback);
  const assignee = sanitizeInlineText(assigneeRaw) || strings.assigneeFallback;
  const labels = raw?.labels || [];
  const dependencyEditingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);

  // Build dependency trees for visualization
  const treeData = allItems && allItems.length > 0 ? buildDependencyTrees(allItems, item.id) : { upstream: [], downstream: [] };
  const hasUpstream = treeData.upstream.length > 0;
  const hasDownstream = treeData.downstream.length > 0;
  const hasAnyDeps = hasUpstream || hasDownstream;

  const statusColor = {
    'open': '#3794ff',
    'in_progress': '#f9c513',
    'blocked': '#f14c4c',
    'closed': '#73c991'
  }[item.status || 'open'] || '#666';

  const statusDisplay = getStatusLabel(item.status, strings) || strings.statusLabels.open;

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `style-src 'nonce-${nonce}' ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
    "connect-src 'none'",
    "frame-src 'none'"
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${item.id}</title>
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <style nonce="${nonce}">
        :root {
            --spacing-unit: 16px;
            --font-size-title: 24px;
            --font-size-meta: 13px;
            --header-padding: 20px;
        }
        body.compact {
            --spacing-unit: 8px;
            --font-size-title: 18px;
            --font-size-meta: 11px;
            --header-padding: 12px;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
            line-height: 1.5;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: var(--header-padding);
            flex: 1;
            overflow-y: auto;
            width: 100%;
            box-sizing: border-box;
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: var(--spacing-unit);
            margin-bottom: var(--spacing-unit);
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .id-badge {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 4px;
            cursor: pointer;
        }
        .actions {
            display: flex;
            gap: 8px;
        }
        .icon-button {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .icon-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .delete-button {
            color: var(--vscode-errorForeground) !important;
        }
        .title {
            font-size: var(--font-size-title);
            font-weight: 600;
            margin: 0 0 8px 0;
            line-height: 1.2;
            border: 1px solid transparent;
            border-radius: 4px;
            padding: 2px 4px;
            margin-left: -5px;
        }
        .title[contenteditable="true"] {
            background-color: var(--vscode-input-background);
            border-color: var(--vscode-input-border);
            outline: none;
        }
        .title[contenteditable="true"]:focus {
            border-color: var(--vscode-focusBorder);
        }
        .meta-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 8px 16px;
            font-size: var(--font-size-meta);
            color: var(--vscode-descriptionForeground);
        }
        .meta-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .meta-label {
            font-weight: 500;
            opacity: 0.8;
        }
        .meta-value {
            color: var(--vscode-foreground);
        }
        .section {
            margin-bottom: var(--spacing-unit);
        }
        .section-title {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }
        .description {
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            padding: 12px;
            border-radius: 2px;
        }
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .tag {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .tag-remove {
            cursor: pointer;
            font-weight: bold;
            opacity: 0.7;
        }
        .tag-remove:hover {
            opacity: 1;
            color: var(--vscode-errorForeground);
        }
        /* Dependency Tree Styles */
        .tree-container {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }
        .tree-branch {
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .tree-branch:last-child {
            border-bottom: none;
        }
        .tree-direction-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            text-transform: uppercase;
        }
        .tree-branch-nodes {
            margin-left: 4px;
        }
        .tree-row {
            padding: 2px 0;
        }
        .tree-row-main {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .tree-left {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        .tree-id {
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-textLink-foreground);
            font-weight: 500;
        }
        .dep-type {
            font-size: 10px;
            padding: 1px 4px;
            border-radius: 4px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            opacity: 0.8;
        }
        .empty {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 8px;
        }
        .external-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            cursor: pointer;
        }
        .external-link:hover {
            text-decoration: underline;
        }
        /* Status Dropdown */
        .status-wrapper {
            position: relative;
        }
        .status-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            min-width: 150px;
        }
        .status-dropdown.show {
            display: block;
        }
        .status-option {
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
        }
        .status-option:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .status-badge {
            cursor: pointer;
        }
        .status-badge:hover {
            opacity: 0.8;
        }
        .editable-field {
            width: 100%;
            min-height: 60px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            padding: 8px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            resize: vertical;
            box-sizing: border-box;
        }
        .editable-field:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-top">
                <div class="header-left">
                    <div class="id-badge" title="Copy ID" onclick="copyToClipboard('${item.id}')">${item.id}</div>
                    <div class="status-wrapper">
                        <div class="status-badge" id="statusBadge" style="color: ${statusColor}; border: 1px solid ${statusColor}44; background-color: ${statusColor}11; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer;" data-status="${item.status || 'open'}">
                            ${statusDisplay} ▾
                        </div>
                        <div class="status-dropdown" id="statusDropdown">
                            <div class="status-option" data-status="open">${strings.statusLabels.open}</div>
                            <div class="status-option" data-status="in_progress">${strings.statusLabels.in_progress}</div>
                            <div class="status-option" data-status="blocked">${strings.statusLabels.blocked}</div>
                            <div class="status-option" data-status="closed">${strings.statusLabels.closed}</div>
                        </div>
                    </div>
                    <div class="status-wrapper">
                        <div class="status-badge" id="typeBadge" style="background-color: var(--vscode-badge-background); padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer;" data-type="${issueType}">
                            ${issueType.toUpperCase()} ▾
                        </div>
                        <div class="status-dropdown" id="typeDropdown">
                            <div class="type-option" data-type="task">TASK</div>
                            <div class="type-option" data-type="bug">BUG</div>
                            <div class="type-option" data-type="feature">FEATURE</div>
                            <div class="type-option" data-type="epic">EPIC</div>
                        </div>
                    </div>
                </div>
                <div class="actions">
                    <button id="toggle-compact" class="icon-button" title="${t('Toggle density')}">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v2H1V3zm0 4h14v2H1V7zm0 4h14v2H1v-2z"/></svg>
                    </button>
                    <button class="icon-button delete-button" id="deleteButton" title="${strings.deleteLabel}">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 2H9.5V3H14V4H2V3H6.5V2ZM3 5H13V14C13 14.55 12.55 15 12 15H4C3.45 15 3 14.55 3 14V5ZM5 7V13H6V7H5ZM8 7V13H9V7H8ZM11 7V13H12V7H11Z"/></svg>
                    </button>
                </div>
            </div>
            <h1 class="title" id="issueTitle" contenteditable="true">${escapeHtml(item.title)}</h1>
            <div class="meta-grid">
                <div class="meta-item">
                    <span class="meta-label">${strings.assigneeLabel}</span>
                    <span class="meta-value" id="assignee-edit" style="cursor: pointer; border-bottom: 1px dashed var(--vscode-descriptionForeground);">${escapeHtml(assignee)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Priority:</span>
                    <div class="status-wrapper" style="display: inline-block;">
                        <span class="meta-value" id="priorityBadge" style="cursor: pointer; border-bottom: 1px dashed var(--vscode-descriptionForeground);" data-priority="${priority}">
                            P${priority} ▾
                        </span>
                        <div class="status-dropdown" id="priorityDropdown">
                            <div class="priority-option" data-priority="0">P0 (Highest)</div>
                            <div class="priority-option" data-priority="1">P1 (High)</div>
                            <div class="priority-option" data-priority="2">P2 (Medium)</div>
                            <div class="priority-option" data-priority="3">P3 (Low)</div>
                            <div class="priority-option" data-priority="4">P4 (Lowest)</div>
                        </div>
                    </div>
                </div>
                <div class="meta-item">
                    <span class="meta-label">${strings.createdLabel}</span>
                    <span class="meta-value">${createdAt}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">${strings.updatedLabel}</span>
                    <span class="meta-value">${updatedAt}</span>
                </div>
                ${item.externalReferenceId ? `
                <div class="meta-item">
                    <span class="meta-label">${strings.externalRefLabel}</span>
                    <span class="meta-value external-link" onclick="openExternal('${item.externalReferenceId}')">${escapeHtml(item.externalReferenceId)}</span>
                </div>` : ''}
            </div>
        </div>

        <div class="section">
            <div class="section-title">${strings.descriptionLabel}</div>
            <textarea class="editable-field" id="description" placeholder="Add a description...">${escapeHtml(description)}</textarea>
        </div>

        <div class="section">
            <div class="section-title">${strings.designLabel}</div>
            <textarea class="editable-field" id="design" placeholder="Add design notes...">${escapeHtml(design)}</textarea>
        </div>

        <div class="section">
            <div class="section-title">${strings.acceptanceLabel}</div>
            <textarea class="editable-field" id="acceptanceCriteria" placeholder="Add acceptance criteria...">${escapeHtml(acceptanceCriteria)}</textarea>
        </div>

        <div class="section">
            <div class="section-title">${strings.notesLabel}</div>
            <textarea class="editable-field" id="notes" placeholder="Add notes...">${escapeHtml(notes)}</textarea>
        </div>

        <div class="section">
            <div class="section-title">${strings.labelsLabel}</div>
            <div class="tags" id="labelsContainer">
                ${labels.map((l: string) => `<span class="tag" data-label="${escapeHtml(l)}">${escapeHtml(l)}<span class="tag-remove" onclick="removeLabel('${escapeHtml(l)}')">×</span></span>`).join('')}
                <button class="icon-button" id="addLabelButton" title="${strings.addLabelLabel}">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/></svg>
                </button>
            </div>
        </div>

        <div class="section">
            <div class="section-title">${strings.dependencyTreeTitle}</div>
            <div class="tree-container">
                ${renderBranchSection('upstream', treeData.upstream, strings.dependencyTreeUpstream, item.id, strings, dependencyEditingEnabled)}
                ${renderBranchSection('downstream', treeData.downstream, strings.dependencyTreeDownstream, item.id, strings, dependencyEditingEnabled)}
                ${!hasAnyDeps ? `<div class="empty">${strings.dependencyEmptyLabel}</div>` : ''}
            </div>
            ${dependencyEditingEnabled ? `
            <div class="tree-actions" style="margin-top: 8px;" id="treeActions">
                <button class="icon-button" id="addUpstreamButton" title="${strings.addUpstreamLabel}">+ Upstream</button>
                <button class="icon-button" id="addDownstreamButton" title="${strings.addDownstreamLabel}">+ Downstream</button>
            </div>` : ''}
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const state = vscode.getState() || { compact: false };
        
        if (state.compact) {
            document.body.classList.add('compact');
        }

        document.getElementById('toggle-compact').addEventListener('click', () => {
            document.body.classList.toggle('compact');
            const isCompact = document.body.classList.contains('compact');
            vscode.setState({ ...state, compact: isCompact });
        });

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text);
        }

        function openExternal(url) {
            vscode.postMessage({ command: 'openExternal', url });
        }

        function openBead(beadId) {
            vscode.postMessage({ command: 'openBead', beadId });
        }

        function removeLabel(label) {
            vscode.postMessage({ command: 'removeLabel', label });
        }

        const deleteButton = document.getElementById('deleteButton');
        const issueTitle = document.getElementById('issueTitle');
        const addLabelButton = document.getElementById('addLabelButton');
        const statusBadge = document.getElementById('statusBadge');
        const statusDropdown = document.getElementById('statusDropdown');

        // Auto-resize textareas
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
        });

        // Field updates
        function setupField(id, command) {
            const element = document.getElementById(id);
            if (!element) return;

            let originalValue = element.value || element.innerText;

            element.addEventListener('blur', () => {
                const newValue = element.value || element.innerText;
                if (newValue !== originalValue) {
                    vscode.postMessage({ command, value: newValue, issueId: '${item.id}' });
                    originalValue = newValue;
                }
            });
            
            // Handle Enter in title to blur
            if (id === 'issueTitle') {
                element.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        element.blur();
                    }
                });
            }
        }

        setupField('issueTitle', 'updateTitle');
        setupField('description', 'updateDescription');
        setupField('design', 'updateDesign');
        setupField('acceptanceCriteria', 'updateAcceptanceCriteria');
        setupField('notes', 'updateNotes');

        deleteButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'deleteBead', beadId: '${item.id}' });
        });

        document.getElementById('assignee-edit').addEventListener('click', () => {
            vscode.postMessage({ command: 'editAssignee', issueId: '${item.id}' });
        });

        addLabelButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'addLabel' });
        });

        if (document.getElementById('addUpstreamButton')) {
            document.getElementById('addUpstreamButton').addEventListener('click', () => {
                // sourceId is the current item (it depends on the target)
                // targetId will be selected via Quick Pick in the extension
                vscode.postMessage({ command: 'addDependency', sourceId: '${item.id}' });
            });
        }

        if (document.getElementById('addDownstreamButton')) {
            document.getElementById('addDownstreamButton').addEventListener('click', () => {
                // targetId is the current item (the selected item will depend on it)
                // sourceId will be selected via Quick Pick in the extension
                vscode.postMessage({ command: 'addDependency', targetId: '${item.id}' });
            });
        }

        // Handle dependency removal buttons
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('dependency-remove')) {
                const sourceId = target.getAttribute('data-source-id');
                const targetId = target.getAttribute('data-target-id');
                if (sourceId && targetId) {
                    vscode.postMessage({ command: 'removeDependency', sourceId, targetId });
                }
            }
        });

        // Status Dropdown Logic
        statusBadge.addEventListener('click', () => {
            statusDropdown.classList.toggle('show');
        });

        document.querySelectorAll('.status-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const newStatus = opt.getAttribute('data-status');
                vscode.postMessage({ command: 'updateStatus', status: newStatus });
                statusDropdown.classList.remove('show');
            });
        });

        // Type Dropdown Logic
        const typeBadge = document.getElementById('typeBadge');
        const typeDropdown = document.getElementById('typeDropdown');

        typeBadge.addEventListener('click', () => {
            typeDropdown.classList.toggle('show');
        });

        document.querySelectorAll('.type-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const newType = opt.getAttribute('data-type');
                vscode.postMessage({ command: 'updateType', type: newType });
                typeDropdown.classList.remove('show');
            });
        });

        // Priority Dropdown Logic
        const priorityBadge = document.getElementById('priorityBadge');
        const priorityDropdown = document.getElementById('priorityDropdown');

        priorityBadge.addEventListener('click', () => {
            priorityDropdown.classList.toggle('show');
        });

        document.querySelectorAll('.priority-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const newPriority = opt.getAttribute('data-priority');
                vscode.postMessage({ command: 'updatePriority', priority: parseInt(newPriority, 10) });
                priorityDropdown.classList.remove('show');
            });
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!statusBadge.contains(e.target) && !statusDropdown.contains(e.target)) {
                statusDropdown.classList.remove('show');
            }
            if (!typeBadge.contains(e.target) && !typeDropdown.contains(e.target)) {
                typeDropdown.classList.remove('show');
            }
            if (!priorityBadge.contains(e.target) && !priorityDropdown.contains(e.target)) {
                priorityDropdown.classList.remove('show');
            }
        });
    </script>
</body>
</html>`;
}
