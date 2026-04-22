"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/auth";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/insights", label: "Insights" },
  { href: "/anomalies", label: "Anomalies" },
  { href: "/settings", label: "Settings", adminOnly: true },
] as const;

export function NavLinks({ role }: { role?: UserRole }) {
  const pathname = usePathname();
  const visible = LINKS.filter(
    (link) => !("adminOnly" in link && link.adminOnly) || role !== "readonly",
  );

  return (
    <>
      {visible.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-2 text-sm transition-colors rounded-md ${
              active
                ? "text-white bg-zinc-800/60"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
