import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { ProviderButton } from "@/components/auth/provider-button";

export const metadata: Metadata = { title: "Sign in" };

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
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-fg">
          W
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Sign in to Wrangle</h1>
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
    </main>
  );
}
