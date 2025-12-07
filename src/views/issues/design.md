# Issues List Webview Design

## Layout

The webview will use a standard list layout with fixed-height rows (or variable if needed, but fixed is better for virtualization).

### Container
- `display: flex`
- `flex-direction: column`
- `height: 100%`
- `overflow-y: auto`

### Row Structure

Each row represents an issue.

```html
<div class="bead-row" data-id="beads-123" tabindex="0">
  <!-- Left: Icon & Status -->
  <div class="row-icon">
    <span class="codicon codicon-issue-opened" style="color: var(--vscode-charts-blue)"></span>
  </div>

  <!-- Center: Content -->
  <div class="row-content">
    <div class="row-header">
      <span class="bead-title">Fix the login bug</span>
      <span class="bead-id">beads-123</span>
    </div>
    <div class="row-meta">
      <span class="bead-assignee">
        <span class="codicon codicon-account"></span> Gooby
      </span>
      <span class="bead-labels">
        <span class="badge">bug</span>
        <span class="badge">urgent</span>
      </span>
      <span class="bead-updated">2h ago</span>
    </div>
  </div>

  <!-- Right: Actions (hover only) -->
  <div class="row-actions">
    <button class="icon-btn" title="Edit"><span class="codicon codicon-edit"></span></button>
  </div>
</div>
```

## Styling

- Use VS Code CSS variables for colors (`--vscode-list-hoverBackground`, `--vscode-foreground`, etc.).
- Font size: Standard list font size (13px).
- Row height: ~48px (taller than standard 22px tree row).

## Interactions

- **Click**: Send `open` command.
- **Right Click**: Send `contextMenu` command.
- **Hover**: Show action buttons.
- **Keyboard**: Up/Down to navigate, Enter to open.
