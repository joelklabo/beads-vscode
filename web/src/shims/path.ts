export function join(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}

export function normalize(input: string): string {
  return input;
}

export function isAbsolute(input: string): boolean {
  return input.startsWith('/');
}

export function resolve(...parts: string[]): string {
  return join(...parts);
}

export const sep = '/';

export default { join, normalize, isAbsolute, resolve, sep };
