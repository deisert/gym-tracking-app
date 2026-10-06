"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, LayoutDashboard } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Verlauf", Icon: Dumbbell },
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
];

export function BottomTabs() {
  const pathname = usePathname();

  // The login screen has no navigation.
  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-md">
        {TABS.map(({ href, label, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
