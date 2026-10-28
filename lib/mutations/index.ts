import { enqueueMutation } from "@/lib/outbox/client";
import type { Mutation, MutationResult } from "@/lib/mutations/types";

export type { Mutation, MutationResult } from "@/lib/mutations/types";

/**
 * The client mutation layer (docs/OFFLINE-OUTBOX.md §2.2, built in V2 S8).
 * Every queued kind goes through the outbox even when online: the entry is
 * written to IndexedDB, the provider drains it to `POST /api/outbox`, and the
 * views read it back through the overlay reducers (`lib/outbox/overlay.ts`).
 *
 * Resolves `{ok:true}` once the entry is **stored on this device**, not
 * applied — server rejections surface later as a `failed` entry in the
 * review sheet (one toast from the provider, never from the call site).
 * `label` is the human description shown there ("Complete “Buy milk”").
 */
export async function mutate(m: Mutation, label?: string): Promise<MutationResult> {
  const id = await enqueueMutation(m, label);
  if (!id) return { ok: false, error: "Not ready yet — reload the page and try again" };
  return { ok: true, data: { entryId: id } };
}
