import { cn } from "@/lib/utils";

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-16 px-6 py-16 md:py-24", className)}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold uppercase tracking-wider text-accent-strong">{children}</p>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{children}</h2>;
}
