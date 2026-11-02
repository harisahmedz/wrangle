import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { ALLOWED_FORMATS, createUploadSignature, isOwnUploadPublicId } from "@/lib/cloudinary";
import { isHexColor, isValidAmountMinor, MAX_AMOUNT_MINOR } from "@/lib/money";
import { addResourceSchema } from "@/lib/validation/learning";

const me = "0192f1c4-7d2a-7b3c-8e4f-123456789abc"; // uuidv7, like users.id
const other = "0192f1c4-7d2a-7b3c-8e4f-cba987654321";
const asset = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f"; // crypto.randomUUID()

describe("isOwnUploadPublicId", () => {
  it("accepts the shapes createUploadSignature generates", () => {
    expect(isOwnUploadPublicId(`wrangle/${me}/${asset}`, me)).toBe(true);
    expect(isOwnUploadPublicId(`wrangle/${me}/${asset}.pdf`, me)).toBe(true);
    expect(isOwnUploadPublicId(`wrangle/${me}/receipts/${asset}`, me, "receipts")).toBe(true);
    expect(isOwnUploadPublicId(`wrangle/${me}/receipts/${asset}.pdf`, me, "receipts")).toBe(true);
  });

  it("rejects traversal, other users' paths, and anything off-shape", () => {
    const bad = [
      `wrangle/${me}/../${other}/${asset}`,
      `wrangle/${me}/../../wrangle/${other}/${asset}`,
      `wrangle/${other}/${asset}`,
      `wrangle/${me}/receipts/${asset}`, // receipt where an attachment is expected
      `wrangle/${me}/${asset}.exe`,
      `wrangle/${me}/${asset}/x`,
      `wrangle/${me}/not-a-uuid`,
      ` wrangle/${me}/${asset}`,
      `wrangle/${me}/${asset}\n`,
    ];
    for (const id of bad) expect(isOwnUploadPublicId(id, me), id).toBe(false);
    expect(isOwnUploadPublicId(`wrangle/${me}/${asset}`, me, "receipts")).toBe(false);
    expect(isOwnUploadPublicId(`wrangle/${other}/receipts/${asset}`, me, "receipts")).toBe(false);
    expect(isOwnUploadPublicId(`wrangle/.*/${asset}`, ".*")).toBe(false);
  });
});

describe("createUploadSignature", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("signs allowed_formats so Cloudinary enforces the format list", () => {
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    const sig = createUploadSignature(me, "image/png", 1000, "receipts");
    if (!sig.ok) throw new Error(sig.error);
    expect(sig.allowedFormats).toBe(ALLOWED_FORMATS);
    const expected = createHash("sha1")
      .update(
        `allowed_formats=${ALLOWED_FORMATS}&folder=${sig.folder}&public_id=${sig.publicId}&timestamp=${sig.timestamp}secret`,
      )
      .digest("hex");
    expect(sig.signature).toBe(expected);
    expect(isOwnUploadPublicId(`${sig.folder}/${sig.publicId}`, me, "receipts")).toBe(true);
  });

  it("still refuses disallowed types and oversize files up front", () => {
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    expect(createUploadSignature(me, "video/mp4", 1000).ok).toBe(false);
    expect(createUploadSignature(me, "image/png", 10 * 1024 * 1024 + 1).ok).toBe(false);
  });
});

describe("validation bounds", () => {
  it("bounds expense amounts", () => {
    expect(isValidAmountMinor(1)).toBe(true);
    expect(isValidAmountMinor(MAX_AMOUNT_MINOR)).toBe(true);
    expect(isValidAmountMinor(MAX_AMOUNT_MINOR + 1)).toBe(false);
    expect(isValidAmountMinor(0)).toBe(false);
    expect(isValidAmountMinor(-5)).toBe(false);
    expect(isValidAmountMinor(1.5)).toBe(false);
    expect(isValidAmountMinor(Number.NaN)).toBe(false);
  });

  it("accepts only #rrggbb category colours", () => {
    expect(isHexColor("#8b5cf6")).toBe(true);
    expect(isHexColor("#8B5CF6")).toBe(true);
    for (const bad of ["red", "#fff", "#8b5cf6;background:url(x)", "url(x)", "", "#8b5cf6 "]) {
      expect(isHexColor(bad), bad).toBe(false);
    }
  });

  it("accepts only http(s) learning resource URLs", () => {
    const ok = (url: string) =>
      addResourceSchema.safeParse({ itemId: asset, url }).success;
    expect(ok("https://example.com/a")).toBe(true);
    expect(ok("http://example.com")).toBe(true);
    expect(ok("  https://example.com  ")).toBe(true);
    expect(ok("javascript:alert(1)")).toBe(false);
    expect(ok("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(ok("ftp://example.com")).toBe(false);
    expect(ok(`https://example.com/${"a".repeat(600)}`)).toBe(false);
  });
});
