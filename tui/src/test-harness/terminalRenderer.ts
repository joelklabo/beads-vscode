export interface FrameLogEntry {
  /** ANSI/UTF-8 chunk written to stdout */
  data: string;
  /** optional timestamp for debugging */
  timestamp?: number;
}

export interface ReplayOptions {
  cols?: number;
  rows?: number;
}

export interface ReplayResult {
  cols: number;
  rows: number;
  /** Final rendered buffer padded to width */
  text: string;
  /** Lines for easier diffing */
  lines: string[];
}

async function loadXterm() {
  try {
    const [{ Terminal }, { SerializeAddon }] = await Promise.all([
      import('@xterm/headless'),
      import('@xterm/addon-serialize'),
    ]);
    return { Terminal, SerializeAddon } as { Terminal: typeof Terminal; SerializeAddon: typeof SerializeAddon };
  } catch (error) {
    throw new Error(
      'Missing xterm headless dependencies. Install @xterm/headless and @xterm/addon-serialize (see TUI visual testing tasks). Original: ' +
        (error as Error).message
    );
  }
}

function padLine(line: string, width: number): string {
  if (line.length >= width) return line.slice(0, width);
  return line + ' '.repeat(width - line.length);
}

/**
 * Replay ANSI frames into a headless xterm and return the final screen buffer.
 * Deterministic: no random colors/fonts; caller controls cols/rows.
 */
export async function replayFrames(frames: FrameLogEntry[], options: ReplayOptions = {}): Promise<ReplayResult> {
  const cols = options.cols ?? 80;
  const rows = options.rows ?? 24;
  const { Terminal, SerializeAddon } = await loadXterm();

  const term = new Terminal({ cols, rows, allowProposedApi: true });
  const serializer = new SerializeAddon();
  term.loadAddon(serializer);

  for (const frame of frames) {
    term.write(frame.data);
  }

  const serialized = serializer.serialize();
  const lines = serialized.split('\n').map((line) => padLine(line, cols)).slice(0, rows);
  while (lines.length < rows) {
    lines.push(' '.repeat(cols));
  }

  return {
    cols,
    rows,
    text: lines.join('\n'),
    lines,
  };
}
