import { validateStatusSelection } from './status';

const TITLE_MAX_LENGTH = 256;
const LABEL_MAX_LENGTH = 64;
const LABEL_REGEX = /^[A-Za-z0-9 .,:@_-]+$/;

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
  if (/\r|\n/.test(normalized)) {
    return { valid: false, reason: 'invalid_characters' };
  }
  return { valid: true, value: normalized };
}

export function validateLabelInput(label: string): ValidationResult {
  const raw = label ?? '';
  if (/\r|\n|\t/.test(raw)) {
    return { valid: false, reason: 'invalid_characters' };
  }
  const sanitized = raw.replace(/\s+/g, ' ').trim();
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
