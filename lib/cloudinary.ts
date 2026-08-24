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

export type UploadSignature =
  | { ok: true; cloudName: string; apiKey: string; publicId: string; timestamp: number; signature: string; folder: string }
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
  const publicId = `${folder}/${crypto.randomUUID()}${ext}`;

  return {
    ok: true,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    publicId,
    timestamp,
    signature: signParams({
      public_id: publicId,
      timestamp,
      folder,
    }),
    folder,
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
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/destroy`,
      { method: "POST", body: form },
    );
    const json = (await res.json()) as { result?: string };
    return json.result === "ok";
  } catch {
    return false;
  }
}

