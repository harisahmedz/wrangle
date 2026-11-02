import { createHash } from "node:crypto";

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

function signParams(params: Record<string, string | number>): string {
  const secret = process.env.CLOUDINARY_API_SECRET!;
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + secret).digest("hex");
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;
// Signed into every upload, so Cloudinary itself rejects any other format
// (video included). Cloudinary has no signable max-file-size parameter; the
// per-file cap it enforces is the plan's own (10 MB for images and raw files
// on Free), the same as MAX_BYTES.
export const ALLOWED_FORMATS = "jpg,png,webp,gif,pdf";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * True when `publicId` has exactly the shape createUploadSignature hands out
 * for this user: `wrangle/<userId>/<uuid>` (attachments) or
 * `wrangle/<userId>/receipts/<uuid>` (receipts), optionally with `.pdf`.
 * A prefix check would let `wrangle/<me>/../<victim>/…` through.
 */
export function isOwnUploadPublicId(
  publicId: string,
  userId: string,
  subfolder?: "receipts",
): boolean {
  if (!new RegExp(`^${UUID}$`, "i").test(userId)) return false;
  const folder = subfolder ? `${userId}/${subfolder}` : userId;
  return new RegExp(`^wrangle/${folder}/${UUID}(\\.pdf)?$`, "i").test(publicId);
}

export type UploadSignature =
  | { ok: true; cloudName: string; apiKey: string; publicId: string; timestamp: number; signature: string; folder: string; allowedFormats: string }
  | { ok: false; error: string };

export function createUploadSignature(
  userId: string,
  mime: string,
  bytes: number,
  subfolder?: string,
): UploadSignature {
  if (!isCloudinaryConfigured()) {
    return { ok: false, error: "Cloudinary is not configured" };
  }
  if (!ALLOWED_MIME.includes(mime)) {
    return { ok: false, error: "Only images and PDFs are allowed" };
  }
  if (bytes <= 0 || bytes > MAX_BYTES) {
    return { ok: false, error: "File must be between 1 byte and 10MB" };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = subfolder
    ? `wrangle/${userId}/${subfolder}`
    : `wrangle/${userId}`;
  const ext = mime === "application/pdf" ? ".pdf" : "";
  const publicId = `${crypto.randomUUID()}${ext}`;

  return {
    ok: true,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    publicId,
    timestamp,
    signature: signParams({
      allowed_formats: ALLOWED_FORMATS,
      public_id: publicId,
      timestamp,
      folder,
    }),
    folder,
    allowedFormats: ALLOWED_FORMATS,
  };
}

export function receiptDeliveryUrl(publicId: string): string {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (/\.pdf$/i.test(publicId)) {
    return `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}`;
  }
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/${publicId}`;
}

export async function destroyAsset(publicId: string): Promise<boolean> {
  if (!isCloudinaryConfigured()) return false;
  const resourceType = /\.pdf$/i.test(publicId) ? "raw" : "image";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({
    public_id: publicId,
    timestamp,
  });
  const form = new FormData();
  form.set("public_id", publicId);
  form.set("timestamp", String(timestamp));
  form.set("api_key", process.env.CLOUDINARY_API_KEY!);
  form.set("signature", signature);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`,
      { method: "POST", body: form },
    );
    const json = (await res.json()) as { result?: string };
    return json.result === "ok" || json.result === "not found";
  } catch {
    return false;
  }
}
