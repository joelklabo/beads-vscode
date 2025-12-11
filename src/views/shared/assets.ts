export const CODICON_STYLESHEET = 'https://microsoft.github.io/vscode-codicons/dist/codicon.css';

export const buildCodiconLink = (href: string = CODICON_STYLESHEET): string => `<link href="${href}" rel="stylesheet">`;
