export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

export function failure(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
