import { validateStatusSelection } from '../utils/status';
import { validateLabelInput, validateTitleInput } from '../utils/validation';

const BEAD_ID_REGEX = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_URL_LENGTH = 2048;

export type LittleGlenCommand =
  | { command: 'openBead'; beadId: string }
  | { command: 'openExternalUrl'; url: string }
  | { command: 'updateStatus'; status: string }
  | { command: 'updateTitle'; title: string }
  | { command: 'updateDescription' | 'updateDesign' | 'updateAcceptanceCriteria' | 'updateNotes'; value: string }
  | { command: 'editAssignee'; issueId: string }
  | { command: 'addLabel' | 'removeLabel'; label: string }
  | { command: 'addDependency'; issueId?: string; sourceId?: string; targetId?: string }
  | { command: 'removeDependency'; sourceId?: string; targetId?: string; contextId?: string }
  | { command: 'deleteBead'; beadId?: string };

export type AllowedLittleGlenCommand = LittleGlenCommand['command'];

export function isValidBeadId(input: unknown): input is string {
  return typeof input === 'string' && BEAD_ID_REGEX.test(input);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeUrl(input: unknown): input is string {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) {
    return false;
  }
  try {
    const url = new URL(input);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSafeTitle(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const result = validateTitleInput(input);
  return result.valid ? result.value : undefined;
}

function isSafeLabel(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const result = validateLabelInput(input);
  return result.valid ? result.value : undefined;
}

/**
 * Validate and narrow Little Glen webview/hover messages before executing commands.
 * @param message Raw message received from a webview/hover
 * @param allowed Optional allowlist of commands for the current surface
 * @returns A narrowed, trusted command payload or undefined if invalid
 */
export function validateLittleGlenMessage(
  message: unknown,
  allowed?: AllowedLittleGlenCommand[]
): LittleGlenCommand | undefined {
  if (!isPlainObject(message) || typeof message.command !== 'string') {
    return undefined;
  }

  const allowedSet = allowed ? new Set<AllowedLittleGlenCommand>(allowed) : undefined;
  const command = message.command as AllowedLittleGlenCommand;
  if (allowedSet && !allowedSet.has(command)) {
    return undefined;
  }

  switch (command) {
    case 'openBead': {
      const beadId = message.beadId;
      if (isValidBeadId(beadId)) {
        return { command, beadId };
      }
      return undefined;
    }
    case 'openExternalUrl': {
      const url = message.url;
      if (isSafeUrl(url)) {
        return { command, url };
      }
      return undefined;
    }
    case 'updateStatus': {
      const status = message.status;
      const normalized = typeof status === 'string' ? validateStatusSelection(status) : undefined;
      if (normalized) {
        return { command, status: normalized };
      }
      return undefined;
    }
    case 'updateTitle': {
      const title = message.title;
      const normalized = isSafeTitle(title);
      if (normalized) {
        return { command, title: normalized };
      }
      return undefined;
    }
    case 'updateDescription':
    case 'updateDesign':
    case 'updateAcceptanceCriteria':
    case 'updateNotes': {
      const value = message.value;
      if (typeof value === 'string') {
        return { command, value };
      }
      return undefined;
    }
    case 'editAssignee': {
      const issueId = (message as any).issueId;
      if (isValidBeadId(issueId)) {
        return { command, issueId };
      }
      return undefined;
    }
    case 'addLabel':
    case 'removeLabel': {
      const label = message.label;
      const normalized = isSafeLabel(label);
      if (normalized) {
        return { command, label: normalized };
      }
      return undefined;
    }
    case 'addDependency': {
      const issueId = (message as any).issueId;
      const sourceId = (message as any).sourceId;
      const targetId = (message as any).targetId;
      const idsValid = [issueId, sourceId, targetId].every((id) => id === undefined || isValidBeadId(id));
      if (idsValid) {
        return { command, issueId, sourceId, targetId };
      }
      return undefined;
    }
    case 'removeDependency': {
      const sourceId = message.sourceId;
      const targetId = message.targetId;
      const contextId = message.contextId;
      const idsValid = (sourceId === undefined || isValidBeadId(sourceId))
        && (targetId === undefined || isValidBeadId(targetId))
        && (contextId === undefined || isValidBeadId(contextId));
      if (idsValid) {
        return { command, sourceId, targetId, contextId };
      }
      return undefined;
    }
    case 'deleteBead': {
      const beadId = (message as any).beadId;
      if (beadId === undefined || isValidBeadId(beadId)) {
        return { command, beadId };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}
