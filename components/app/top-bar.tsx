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
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur md:px-6"
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
