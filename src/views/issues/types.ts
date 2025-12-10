export interface BeadViewModel {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: number;
  issueType?: string;
  assignee?: {
    name: string;
    color: string; // hex or theme color
    initials?: string;
  };
  labels: string[];
  updatedAt: string; // ISO or relative
  isStale: boolean;
  worktree?: string;
  epicId?: string;
  icon?: {
    id: string;
    color?: string;
  };
}

export type WebviewMessage =
  | { type: 'update'; beads: BeadViewModel[]; sortMode?: string; density?: 'default' | 'compact' }
  | { type: 'config'; config: { showClosed: boolean; sortMode: string } };

export type WebviewCommand =
  | { command: 'open'; id: string }
  | { command: 'updateStatus'; id: string; status: string }
  | { command: 'edit'; id: string }
  | { command: 'contextMenu'; id: string; x: number; y: number }
  | { command: 'log'; text: string }
  | { command: 'pickSort' }
  | { command: 'openInProgressPanel' }
  | { command: 'ready' };
