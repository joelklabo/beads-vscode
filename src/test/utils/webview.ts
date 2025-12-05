export function stripNoDaemon(args: any[]): any[] {
  if (!Array.isArray(args) || args.length === 0) {
    return args;
  }
  return args[0] === '--no-daemon' ? args.slice(1) : args;
}
