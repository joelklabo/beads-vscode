export interface CliExecutionPolicy {
  timeoutMs: number;
  retryCount: number;
  retryBackoffMs: number;
  offlineThresholdMs: number;
  maxBufferBytes?: number;
}

export const DEFAULT_CLI_POLICY: CliExecutionPolicy = {
  timeoutMs: 15000,
  retryCount: 1,
  retryBackoffMs: 500,
  offlineThresholdMs: 30000,
  maxBufferBytes: 10 * 1024 * 1024,
};

export function mergeCliPolicy(
  overrides?: Partial<CliExecutionPolicy>,
  defaults: CliExecutionPolicy = DEFAULT_CLI_POLICY
): CliExecutionPolicy {
  return {
    ...defaults,
    ...(overrides ?? {}),
    maxBufferBytes: overrides?.maxBufferBytes ?? defaults.maxBufferBytes,
  };
}
