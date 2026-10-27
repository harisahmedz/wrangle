import Link from "next/link";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";

export function TopBar({
  name,
  image,
  left,
}: {
  name?: string | null;
  image?: string | null;
  left?: React.ReactNode;
}) {
  return (
    <header
      // `--wco-offset` is 0 outside Window Controls Overlay mode (V2 S7, see
      // app/globals.css), so this is identical to the old fixed padding there.
      style={{ paddingTop: "calc(env(safe-area-inset-top) + var(--wco-offset))" }}
      className="sticky top-0 z-30 flex h-auto min-h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur md:px-6 lg:hidden"
    >
      <div className="flex items-center gap-1">
        {left}
        <Link
          href="/today"
          className="flex items-center gap-2 font-bold tracking-tight"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-black text-accent-fg">
            W
          </span>
          <span className="hidden sm:inline">Wrangle</span>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu name={name} image={image} />
      </div>
    </header>
  );
}
