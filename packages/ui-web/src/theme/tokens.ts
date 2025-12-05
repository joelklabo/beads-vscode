export interface ThemeTokens {
  primary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  danger: string;
  focusOutline: string;
}

export const lightTokens: ThemeTokens = {
  primary: '#2563eb',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#475569',
  border: '#e2e8f0',
  accent: '#14b8a6',
  danger: '#dc2626',
  focusOutline: '#1d4ed8',
};

export type TokenKey = keyof ThemeTokens;
