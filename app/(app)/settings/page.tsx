import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { TimezoneForm } from "@/components/settings/timezone-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const userId = await requireUser();

  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      image: users.image,
      theme: users.theme,
      timezone: users.timezone,
      currency: users.currency,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) notFound();

  const initial = user.name?.trim()?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <section>
        <h2 className="mb-3 font-semibold">Appearance</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <AppearanceForm theme={user.theme} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Time zone</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <TimezoneForm timezone={user.timezone} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Currency</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium">{user.currency}</p>
          <p className="mt-0.5 text-xs text-muted">
            Single currency for now — everything is stored in USD.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Account</h2>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-sm font-semibold">
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name ?? "—"}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <p className="ml-auto hidden max-w-48 text-right text-xs text-muted sm:block">
            Name and photo come from your sign-in provider.
          </p>
        </div>
      </section>
    </div>
  );
}
