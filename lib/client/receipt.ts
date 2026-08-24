"use client";

export type CompressedUpload = {
  file: Blob;
  mime: string;
};

const MAX_DIMENSION = 2048;

export async function prepareReceipt(
  file: File,
): Promise<CompressedUpload> {
  if (!file.type.startsWith("image/")) {
    return { file, mime: file.type || "application/octet-stream" };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, mime: file.type };
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    if (!blob) return { file, mime: file.type };
    return { file: blob, mime: "image/jpeg" };
  } catch {
    return { file, mime: file.type };
  }
}
