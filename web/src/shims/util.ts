export function promisify<T extends (...args: any[]) => any>(fn: T): (...funcArgs: Parameters<T>) => Promise<ReturnType<T>> {
  return (...args: Parameters<T>) => Promise.resolve(fn(...args));
}

export default { promisify };
