import fs from 'fs';
import path from 'path';

export interface SnapshotOptions {
  cellWidth?: number;
  cellHeight?: number;
  fgColor?: [number, number, number, number];
  bgColor?: [number, number, number, number];
  outputPath?: string;
}

function loadPng() {
  try {
    // Lazy require to avoid hard dependency when optional tools are not installed yet
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PNG } = require('pngjs');
    return PNG as typeof import('pngjs').PNG;
  } catch (error) {
    throw new Error(
      'Missing pngjs dependency. Install pngjs (added in TUI visual tasks) to render PNG snapshots. Original: ' +
        (error as Error).message
    );
  }
}

/**
 * Render a simple monochrome PNG from terminal text lines.
 * Each cell becomes a filled rectangle; non-space -> fgColor, space -> bgColor.
 */
export function renderTextToPng(lines: string[], options: SnapshotOptions = {}): Buffer {
  const cellWidth = options.cellWidth ?? 2;
  const cellHeight = options.cellHeight ?? 4;
  const fg = options.fgColor ?? [255, 255, 255, 255];
  const bg = options.bgColor ?? [20, 20, 20, 255];

  const width = Math.max(1, Math.max(...lines.map((l) => l.length), 0)) * cellWidth;
  const height = lines.length * cellHeight;

  const PNG = loadPng();
  const png = new PNG({ width, height, colorType: 6 });

  const setPixel = (x: number, y: number, color: [number, number, number, number]) => {
    const idx = (width * y + x) << 2;
    png.data[idx] = color[0];
    png.data[idx + 1] = color[1];
    png.data[idx + 2] = color[2];
    png.data[idx + 3] = color[3];
  };

  for (let row = 0; row < lines.length; row += 1) {
    const line = lines[row];
    for (let col = 0; col < line.length; col += 1) {
      const color = line[col] === ' ' ? bg : fg;
      for (let dy = 0; dy < cellHeight; dy += 1) {
        for (let dx = 0; dx < cellWidth; dx += 1) {
          setPixel(col * cellWidth + dx, row * cellHeight + dy, color);
        }
      }
    }
    // pad remaining columns to width
    for (let col = line.length; col < width / cellWidth; col += 1) {
      const color = bg;
      for (let dy = 0; dy < cellHeight; dy += 1) {
        for (let dx = 0; dx < cellWidth; dx += 1) {
          setPixel(col * cellWidth + dx, row * cellHeight + dy, color);
        }
      }
    }
  }

  const buffer = PNG.sync.write(png);
  if (options.outputPath) {
    const outPath = path.resolve(options.outputPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buffer);
  }
  return buffer;
}
