// Type declarations for breeds.mjs, so the webview can reuse the generator.

export type Rgb = [number, number, number];

/** One resolved label cell of a frame (see canvas.mjs). */
export interface Cell {
  label: string;
  part: string;
  lx: number;
  ly: number;
  len?: number;
  dir?: string;
}

export type Pattern = (cell: Cell, dir: string) => string | null;

/** A breed: palette keys (fur, shade, belly, stripe...) plus silhouette traits. */
export interface Breed {
  name: string;
  breed: string;
  pattern?: Pattern;
  ears: string;
  tail: string;
  whiskers: boolean;
  ruff: boolean;
  collar: Rgb | null;
  eye2?: Rgb;
  [key: string]: unknown;
}

export const BREEDS: Breed[];

export function colorize(
  breed: Breed,
  cell: Cell | null,
  dir: string,
): [number, number, number, number];
