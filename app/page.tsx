import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { buttonStyles } from "@/components/ui/button";
import { Modules } from "@/components/marketing/modules";
import { Eyebrow, Heading, Section } from "@/components/marketing/section";
import { Frame, PhoneFrame, Shot, type ShotName } from "@/components/marketing/shot";

const LOOP: { name: string; body: string; shot?: ShotName }[] = [
  {
    name: "Dump",
    body: "Type whatever is on your mind. Wrangle suggests tasks, ideas, expenses and things to learn; you fix them in a tray before anything is saved.",
  },
  {
    name: "Shutdown",
    body: "Close out the day: tick what got done, move what did not, and walk away with tomorrow already sorted.",
    shot: "shutdown",
  },
  {
    name: "Weekly",
    body: "See what slipped, what shipped, what you learned and what you spent, then reschedule the leftovers in one tap.",
    shot: "weekly",
  },
  {
    name: "Wrapped",
    body: "After enough active days you get a story-style recap of your month that you can share. No streaks to protect.",
    shot: "wrapped",
  },
];

const EVERYWHERE = [
  { title: "Installable", body: "Add it to your home screen or dock. It runs as its own app, no store needed." },
  { title: "Works offline", body: "Add and complete tasks and expenses with no signal. Changes sync when you are back online." },
  { title: "Phone, tablet, desktop", body: "Bottom tabs on a phone, a sidebar on a big screen. Same account, same data." },
];

const AI_POINTS = [
  ["Off by default", "Nothing runs, and nothing leaves your device, until you choose."],
  [
    "On-device first",
    "On desktop Chrome and Edge, Gemini Nano runs right in the browser. Your text stays on your machine.",
  ],
  [
    "Or bring your own key",
    "Connect your own OpenRouter key. It lives on your device and goes straight to OpenRouter, never through our server. In that mode your task text goes to OpenRouter and its free providers, who may log it.",
  ],
  ["Nothing auto-applied", "Suggestions are proposals. You review and accept each one."],
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/today");

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex min-h-11 items-center gap-2.5 font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-black text-accent-fg">
              W
            </span>
            Wrangle
          </Link>
          <Link href="/signin" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Sign in
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-6 pb-16 pt-16 md:pt-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-gradient-to-b from-accent/15 to-transparent"
          />
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Wrangle it all.</h1>
              <p className="mt-5 text-lg text-muted sm:text-xl">
                One calm, installable app for your tasks, ideas, learning and spending, organised by
                project and free to use.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/signin" className={buttonStyles({ variant: "primary", size: "lg" })}>
                  Get started
                </Link>
                <a href="#how" className={buttonStyles({ variant: "ghost", size: "lg" })}>
                  See how it works
                </a>
              </div>
            </div>

            <div className="relative mx-auto mt-14 max-w-5xl">
              <Frame>
                <Shot
                  name="hero-desktop"
                  priority
                  alt="Wrangle on desktop: a sidebar with Today, Upcoming, Boards, Money and Learn, and a three-column kanban board"
                  sizes="(min-width: 1024px) 1024px, 100vw"
                />
              </Frame>
              <PhoneFrame className="absolute -bottom-10 -right-4 hidden w-40 md:block lg:-right-10 lg:w-52">
                <Shot name="hero-phone" alt="Wrangle on a phone showing today's tasks" sizes="208px" />
              </PhoneFrame>
            </div>
          </div>
        </section>

        {/* Launch video (V3 S9v): click to play, silent, preload="none" so it never competes with the hero for LCP. */}
        <Section className="pt-0 md:pt-0">
          <div className="mx-auto max-w-4xl">
            <Frame chrome={false}>
              <video
                className="block aspect-video h-auto w-full bg-surface-2"
                src="/marketing/launch.mp4"
                poster="/marketing/launch-poster.webp"
                width={1920}
                height={1080}
                controls
                muted
                playsInline
                preload="none"
                aria-label="A 25-second tour of Wrangle: the Dump sorts a brain dump, Today and Upcoming on a phone, a board, a shared card with a checklist, the weekly review."
              />
            </Frame>
          </div>
        </Section>

        <Section id="how">
          <div className="mb-14 max-w-2xl">
            <Eyebrow>Four modules, one place</Eyebrow>
            <Heading>Everything you juggle, side by side.</Heading>
          </div>
          <Modules />
        </Section>

        <Section className="bg-sidebar">
          <div className="max-w-2xl">
            <Eyebrow>The Loop</Eyebrow>
            <Heading>Capture, close the day, review the week.</Heading>
            <p className="mt-4 text-lg text-muted">
              A small rhythm that keeps the app honest: get it out of your head, finish the day, look
              back.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map((s, i) => (
              <li key={s.name} className="flex flex-col rounded-xl border border-border bg-surface p-5">
                <span className="text-sm font-semibold text-accent-strong">0{i + 1}</span>
                <h3 className="mt-1 text-xl font-semibold">{s.name}</h3>
                <p className="mt-2 text-muted">{s.body}</p>
                {s.shot && (
                  <div className="mt-5 overflow-hidden rounded-lg border border-border">
                    <Shot name={s.shot} alt={`${s.name} on a phone`} sizes="(min-width: 1024px) 260px, (min-width: 640px) 45vw, 90vw" />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>

        <Section>
          <div className="max-w-2xl">
            <Eyebrow>Works everywhere</Eyebrow>
            <Heading>Your pocket, your desk, no signal.</Heading>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {EVERYWHERE.map((e) => (
              <div key={e.title} className="rounded-xl border border-border bg-surface p-5">
                <h3 className="text-lg font-semibold">{e.title}</h3>
                <p className="mt-2 text-muted">{e.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section className="bg-sidebar">
          <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Eyebrow>AI on your terms</Eyebrow>
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-strong">
                  Coming in V3
                </span>
              </div>
              <Heading>Optional, private and never automatic.</Heading>
              <p className="mt-4 text-lg text-muted">
                Assistive AI is on the way. It will be off until you turn it on, and Wrangle will never
                run it on our servers.
              </p>
            </div>
            <ul className="space-y-4">
              {AI_POINTS.map(([t, b]) => (
                <li key={t} className="rounded-xl border border-border bg-surface p-5">
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-muted">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Free, and it stays tidy</Eyebrow>
            <Heading>No ads. No price tag. Share with a link.</Heading>
            <p className="mt-4 text-lg text-muted">
              Wrangle is free to use and has no ads. Share a project with anyone through an invite
              link, and choose whether they can edit or only view.
            </p>
            <Link href="/signin" className={buttonStyles({ variant: "primary", size: "lg", className: "mt-8" })}>
              Get started
            </Link>
          </div>
        </Section>
      </main>

      <footer className="border-t border-border px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-black text-accent-fg">
              W
            </span>
            <span>Wrangle. Wrangle it all.</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/signin" className="flex min-h-11 items-center px-3 hover:text-text">
              Sign in
            </Link>
            <a href="#how" className="flex min-h-11 items-center px-3 hover:text-text">
              How it works
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
