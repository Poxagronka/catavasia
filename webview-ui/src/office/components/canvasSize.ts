/**
 * Size the canvas backing store to device pixels (no DPR transform on ctx).
 * Assigning width/height clears the bitmap even at the same value, so assign
 * only on a real change — otherwise the scene blinks until the next frame.
 */
/** Structural subset of HTMLCanvasElement (keeps this testable without DOM lib). */
export interface SizedCanvas {
  width: number;
  height: number;
  style: { width: string; height: string };
}

export function syncCanvasSize(
  canvas: SizedCanvas,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): void {
  const w = Math.round(cssWidth * dpr);
  const h = Math.round(cssHeight * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
}
