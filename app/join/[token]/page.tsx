import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { redeemInviteForUser } from "@/lib/actions/invites";
import { hashToken } from "@/lib/sharing/tokens";
import { hitRateLimit } from "@/lib/sharing/ratelimit";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Join project" };

const STATE_COPY: Record<string, { title: string; detail: string }> = {
  invalid: {
    title: "This invite doesn't exist",
    detail: "Double-check the link you were sent.",
  },
  revoked: {
    title: "This invite was revoked",
    detail: "Ask the project owner for a new link.",
  },
  expired: {
    title: "This invite has expired",
    detail: "Ask the project owner for a new link.",
  },
  "used-up": {
    title: "This invite has no uses left",
    detail: "Ask the project owner for a new link.",
  },
};

export default async function JoinPage({ params }: Props) {
  const { token } = await params;

  if (token.length < 20 || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return <JoinState state="invalid" />;
  }

  const rateKey = await redeemIpKey();
  const limit = await hitRateLimit(`inv:redeem:${rateKey}`, 20, 600);
  if (!limit.allowed) {
    return (
      <JoinState
        state="slow-down"
        title="Too many attempts"
        detail="Wait a few minutes and try again."
      />
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          You&apos;ve been invited to a project
        </h1>
        <p className="max-w-sm text-sm text-muted">
          Sign in with Google or GitHub to join. The invite is applied
          automatically after sign-in.
        </p>
        <div className="w-full max-w-xs space-y-3">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: `/join/${token}` });
            }}
          >
            <button
              type="submit"
              className="h-12 w-full rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-2"
            >
              Continue with Google
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: `/join/${token}` });
            }}
          >
            <button
              type="submit"
              className="h-12 w-full rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-2"
            >
              Continue with GitHub
            </button>
          </form>
        </div>
      </main>
    );
  }

  const result = await redeemInviteForUser(hashToken(token), session.user.id);

  if (result.state === "joined" || result.state === "already-member") {
    redirect(`/p/${result.projectId}/b/todo`);
  }

  return <JoinState state={result.state} />;
}

async function redeemIpKey(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return ip;
}

function JoinState({
  state,
  title,
  detail,
}: {
  state: string;
  title?: string;
  detail?: string;
}) {
  const copy = STATE_COPY[state] ?? { title: title ?? "Something went wrong", detail: detail ?? "" };
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span className="text-4xl" aria-hidden>
        {state === "slow-down" ? "🐢" : "🔗"}
      </span>
      <h1 className="text-xl font-bold tracking-tight">{copy.title}</h1>
      <p className="max-w-sm text-sm text-muted">{copy.detail}</p>
      <Link href="/today" className="text-sm text-accent-strong hover:underline">
        Go to Wrangle
      </Link>
    </main>
  );
}
