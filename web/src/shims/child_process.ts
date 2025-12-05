export function execFile(): never {
  throw new Error('child_process.execFile is not available in the web shell');
}

export default { execFile };
