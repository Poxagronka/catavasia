/**
 * Browser side of the feedback images: a PNG of the office canvas, and a
 * copy of an image to the clipboard for the browser-form fallback.
 */

/** The office canvas (OfficeCanvas.tsx) as a PNG file, or null when it is not there. */
export async function captureOffice(): Promise<File | null> {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="office-canvas"]');
  if (!canvas) return null;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new File([blob], `office-${stamp}.png`, { type: 'image/png' });
}

/** A PNG copy of `blob`: browsers put only PNG images on the clipboard. */
async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('Could not convert the image');
  return png;
}

/** Put the image on the clipboard. False when the browser does not allow it. */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    const png = await asPng(blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}
