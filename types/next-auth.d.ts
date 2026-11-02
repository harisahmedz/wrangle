import type { Theme } from "@/db/schema";
import type { AiMode } from "@/lib/ai/types";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      timezone: string;
      theme: Theme;
      /** `users.prefs.ai.mode`, defaulting to "off" (ROADMAP-V3 S0). */
      aiMode: AiMode;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    timezone: string;
    theme: Theme;
    /** The raw `users.prefs` jsonb (present on adapter rows, not on `Session.user`); parse with `parseUserPrefs`. */
    prefs?: unknown;
  }
}
