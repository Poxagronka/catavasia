/**
 * Browser side of the dock's attachments: a big image is downscaled on a
 * canvas (longest edge CEO_IMAGE_EDGE_PX, JPEG), and a file becomes base64
 * for POST /api/ceo/messages.
 */

import type { CeoAttachmentUpload } from '../../../core/src/ceoDesk.js';
import { type DraftAttachment, fitEdge, isImageType, needsDownscale } from './attachState.js';

const JPEG_QUALITY = 0.9;

async function downscale(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitEdge(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** A picked, pasted or dropped file, ready for the strip. A failed downscale keeps the file. */
export async function prepareAttachment(file: File, id: number): Promise<DraftAttachment> {
  const ready = needsDownscale(file) ? await downscale(file).catch(() => file) : file;
  const image = isImageType(ready.type);
  return {
    id,
    name: ready.name || 'file',
    type: ready.type,
    size: ready.size,
    image,
    blob: ready,
    ...(image ? { preview: URL.createObjectURL(ready) } : {}),
  };
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}

export async function toUploads(files: DraftAttachment[]): Promise<CeoAttachmentUpload[]> {
  return Promise.all(
    files.map(async (f) => ({ name: f.name, type: f.type, data: await base64(f.blob) })),
  );
}
