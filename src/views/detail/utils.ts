import * as vscode from 'vscode';
import { BeadDetailStrings, StatusLabelMap } from './types';
import { escapeHtml } from '../../utils';

const t = vscode.l10n.t;

export const statusColors: Record<string, string> = {
  open: '#3794ff',
  in_progress: '#f9c513',
  blocked: '#f14c4c',
  closed: '#73c991',
};

export const getStatusLabel = (status: string | undefined, strings: BeadDetailStrings): string => {
  if (!status) {
    return '';
  }
  const key = status as keyof StatusLabelMap;
  return strings.statusLabels[key] ?? status;
};

export const renderBranch = (
  nodes: any[],
  parentId: string,
  direction: 'upstream' | 'downstream',
  depth: number,
  strings: BeadDetailStrings,
  dependencyEditingEnabled: boolean
): string => {
  return nodes
    .map((node: any) => {
      const removeSourceId = direction === 'upstream' ? parentId : node.id;
      const removeTargetId = direction === 'upstream' ? node.id : parentId;
      const externalUrl = node.externalReferenceId;
      const children = node.children && node.children.length > 0 ? renderBranch(node.children, node.id, direction, depth + 1, strings, dependencyEditingEnabled) : '';
      const color = statusColors[node.status || 'open'] || statusColors.open;
      const statusLabel = getStatusLabel(node.status, strings) || strings.statusLabels.open;
      const safeType = escapeHtml(node.type);
      const ariaLabelParts = [
        `${escapeHtml(node.id)}`,
        node.title ? escapeHtml(node.title) : '',
        statusLabel ? t('Status {0}', statusLabel) : '',
        direction === 'upstream' ? strings.dependencyTreeUpstream : strings.dependencyTreeDownstream,
        safeType ? t('Type {0}', safeType) : ''
      ].filter(Boolean);
      return `
        <div class="tree-row" role="treeitem" aria-level="${depth + 1}" aria-expanded="${children ? 'true' : 'false'}" tabindex="-1" data-issue-id="${escapeHtml(node.id)}" data-parent-id="${escapeHtml(parentId)}" data-direction="${direction}" style="--depth:${depth}" aria-label="${ariaLabelParts.join(' • ')}" title="${escapeHtml(node.title || '')}">
          <div class="tree-row-main">
            <div class="tree-left">
              <span class="status-dot" aria-hidden="true" style="background-color:${color};"></span>
              <span class="status-label">${escapeHtml(statusLabel)}</span>
              <span class="tree-id" style="cursor: pointer; text-decoration: underline;" onclick="openBead('${escapeHtml(node.id)}')">${escapeHtml(node.id)}</span>
              <span class="tree-title">${escapeHtml(node.title || '')}</span>
              ${
                externalUrl
                  ? `<button class="tree-external-link external-link" data-external-url="${escapeHtml(externalUrl)}" title="${escapeHtml(node.externalReferenceDescription || externalUrl)}"><span class="codicon codicon-link-external"></span></button>`
                  : ''
              }
              <span class="dep-type dep-${safeType}">${safeType}</span>
              ${node.missing ? `<span class="missing-pill">${escapeHtml(strings.missingDependencyLabel)}</span>` : ''}
            </div>
            ${
              dependencyEditingEnabled && !node.missing
                ? `<button class="dependency-remove" aria-label="${escapeHtml(strings.removeDependencyLabel)} ${escapeHtml(removeSourceId)} → ${escapeHtml(removeTargetId)}" data-source-id="${escapeHtml(removeSourceId)}" data-target-id="${escapeHtml(removeTargetId)}">${escapeHtml(strings.removeDependencyLabel)}</button>`
                : ''
            }
          </div>
          ${children ? `<div class="tree-children" role="group">${children}</div>` : ''}
        </div>
      `;
    })
    .join('');
};

export const renderBranchSection = (direction: 'upstream' | 'downstream', nodes: any[], label: string, itemId: string, strings: BeadDetailStrings, dependencyEditingEnabled: boolean): string => {
  if (!nodes || nodes.length === 0) {
    return '';
  }
  return `
    <div class="tree-branch" data-direction="${direction}" role="group" aria-label="${escapeHtml(label)}">
      <div class="tree-direction-label">${escapeHtml(label)}</div>
      <div class="tree-branch-nodes">
        ${renderBranch(nodes, itemId, direction, 0, strings, dependencyEditingEnabled)}
      </div>
    </div>
  `;
};
