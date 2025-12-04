const BEAD_ID_REGEX = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_TITLE_LENGTH = 256;
const MAX_LABEL_LENGTH = 64;
const MAX_STATUS_LENGTH = 64;
const MAX_URL_LENGTH = 2048;

export type LittleGlenCommand =
  | { command: 'openBead'; beadId: string }
  | { command: 'openExternalUrl'; url: string }
  | { command: 'updateStatus'; status: string }
  | { command: 'updateTitle'; title: string }
  | { command: 'addLabel' | 'removeLabel'; label: string }
  | { command: 'addDependency'; issueId?: string; sourceId?: string; targetId?: string }
  | { command: 'removeDependency'; sourceId?: string; targetId?: string; contextId?: string };

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

function isSafeString(input: unknown, maxLength: number): input is string {
  return typeof input === 'string' && input.trim().length > 0 && input.length <= maxLength;
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
      if (isSafeString(status, MAX_STATUS_LENGTH)) {
        return { command, status: status.trim() };
      }
      return undefined;
    }
    case 'updateTitle': {
      const title = message.title;
      if (isSafeString(title, MAX_TITLE_LENGTH)) {
        return { command, title: title.trim() };
      }
      return undefined;
    }
    case 'addLabel':
    case 'removeLabel': {
      const label = message.label;
      if (isSafeString(label, MAX_LABEL_LENGTH)) {
        return { command, label: label.trim() };
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
    default:
      return undefined;
  }
}
