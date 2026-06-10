"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Section 7.1 navigation. "Item Catalog" is the catalog view (M2 expands it to full CRUD).
// "Plan Week" leads the meals-first wizard (Meals → Staples → Restock → Final). The remaining
// tabs are management/reference areas the wizard draws on.
const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/plan", label: "Plan Week" },
  { href: "/", label: "Dashboard" },
  { href: "/recipes", label: "Recipes" },
  { href: "/staples", label: "Staples & Restock" },
  { href: "/receipts", label: "Receipts" },
  { href: "/items", label: "Item Catalog" },
  { href: "/store-layout", label: "Store Layout" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 bg-aldi-navy shadow-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2.5">
        <Link href="/" className="mr-4 text-base font-bold tracking-tight text-white">
          ALDI <span className="font-normal text-aldi-cyan">Planner</span>
        </Link>
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const lead = item.href === "/plan";
          const className = lead
            ? `rounded bg-aldi-orange px-3 py-1.5 text-sm font-semibold text-white hover:bg-aldi-orange/90 ${active ? "ring-2 ring-white/60" : ""}`
            : active
              ? "rounded bg-aldi-cyan px-3 py-1.5 text-sm font-medium text-aldi-navy"
              : "rounded px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white";
          return (
            <Link key={item.href} href={item.href} className={`${className} ${lead ? "mr-2" : ""}`}>
              {item.label}
            </Link>
          );
        })}
      </div>
      <div aria-hidden className="flex h-1">
        <div className="flex-1 bg-aldi-cyan" />
        <div className="flex-1 bg-aldi-orange" />
        <div className="flex-1 bg-aldi-red" />
        <div className="flex-1 bg-aldi-yellow" />
      </div>
    </nav>
  );
}
