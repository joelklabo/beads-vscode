import { validateStatusSelection } from './status';
import { sanitizeInlineText } from './sanitize';

const TITLE_MAX_LENGTH = 256;
const LABEL_MAX_LENGTH = 64;
const ASSIGNEE_MAX_LENGTH = 64;
const LABEL_REGEX = /^[A-Za-z0-9 .,:@_-]+$/;
const CONTROL_REGEX = /[\u0000-\u001f\u007f]/;

export interface ValidationResult {
  valid: boolean;
  value?: string;
  reason?: string;
}

export function validateTitleInput(title: string): ValidationResult {
  const normalized = (title ?? '').trim();
  if (!normalized) {
    return { valid: false, reason: 'empty' };
  }
  if (normalized.length > TITLE_MAX_LENGTH) {
    return { valid: false, reason: 'too_long' };
  }
  if (/\r|\n/.test(title ?? '')) {
    return { valid: false, reason: 'invalid_characters' };
  }
  return { valid: true, value: normalized };
}

export function validateLabelInput(label: string): ValidationResult {
  const raw = label ?? '';
  if (/\r|\n|\t/.test(raw)) {
    return { valid: false, reason: 'invalid_characters' };
  }
  const sanitized = raw.trim();
  if (!sanitized) {
    return { valid: false, reason: 'empty' };
  }
  if (sanitized.length > LABEL_MAX_LENGTH) {
    return { valid: false, reason: 'too_long' };
  }
  if (!LABEL_REGEX.test(sanitized)) {
    return { valid: false, reason: 'invalid_characters' };
  }
  return { valid: true, value: sanitized };
}

export function validateStatusInput(status: string | undefined): ValidationResult {
  const normalized = validateStatusSelection(status);
  if (!normalized) {
    return { valid: false, reason: 'invalid_status' };
  }
  return { valid: true, value: normalized };
}

export function validateAssigneeInput(input: string | undefined | null): ValidationResult {
  const raw = input ?? '';

  if (CONTROL_REGEX.test(raw)) {
    return { valid: false, reason: 'invalid_characters' };
  }

  const sanitized = sanitizeInlineText(raw);

  // Empty string is allowed to clear the assignee
  if (sanitized.length === 0) {
    return { valid: true, value: '' };
  }

  if (sanitized.length > ASSIGNEE_MAX_LENGTH) {
    return { valid: false, reason: 'too_long' };
  }

  return { valid: true, value: sanitized };
}
