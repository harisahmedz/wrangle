import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { ProviderButton } from "@/components/auth/provider-button";
import { Frame, Shot } from "@/components/marketing/shot";

export const metadata: Metadata = { title: "Sign in" };

const VALUE = [
  "Tasks, ideas, learning and money in one calm place.",
  "Installable, and it keeps working offline.",
  "Free, no ads, and you can share a project with a link.",
];

function safeCallbackUrl(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/today";
}

async function googleSignIn(formData: FormData) {
  "use server";
  await signIn("google", {
    redirectTo: safeCallbackUrl(String(formData.get("callbackUrl"))),
  });
}

async function githubSignIn(formData: FormData) {
  "use server";
  await signIn("github", {
    redirectTo: safeCallbackUrl(String(formData.get("callbackUrl"))),
  });
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/today");
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);

  return (
    <main className="flex flex-1 flex-col md:grid md:grid-cols-2">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 pb-[max(4rem,env(safe-area-inset-bottom))] md:py-24">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-fg">
              W
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Sign in to Wrangle</h1>
          </div>
          <p className="text-sm text-muted md:hidden">Tasks, ideas, learning and money in one place.</p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          <form action={googleSignIn}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <ProviderButton provider="google" />
          </form>
          <form action={githubSignIn}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <ProviderButton provider="github" />
          </form>
        </div>
        <p className="max-w-xs text-center text-xs text-muted">
          Same verified email on Google and GitHub links into one account.
        </p>
      </div>
      <aside className="hidden flex-col justify-center gap-8 overflow-hidden border-l border-border bg-sidebar p-10 md:flex lg:p-14">
        <Frame className="-mr-24 rounded-r-none border-r-0">
          <Shot
            name="hero-desktop"
            alt="Wrangle on desktop with a sidebar and a kanban board"
            sizes="(min-width: 768px) 50vw, 0px"
          />
        </Frame>
        <ul className="max-w-md space-y-3">
          {VALUE.map((v) => (
            <li key={v} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
