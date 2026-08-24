import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buttonStyles } from "@/components/ui/button";
import Link from "next/link";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/today");

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-md text-2xl font-black">
        W
      </div>
      <div className="space-y-3 max-w-lg">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Wrangle it all.
        </h1>
        <p className="text-muted text-lg">
          What to do, what you&apos;re thinking about, what you&apos;re
          learning, what you&apos;re spending — in one place.
        </p>
      </div>
      <Link href="/signin" className={buttonStyles({ variant: "primary", size: "lg" })}>
        Get started
      </Link>
    </main>
  );
}
