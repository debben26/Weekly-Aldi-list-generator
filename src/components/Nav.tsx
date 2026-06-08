"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Section 7.1 navigation. "Items" is added for the catalog view (M2 expands it to full CRUD).
// "Plan Week" leads the meals-first wizard (Meals → Staples → Restock → Final). The remaining
// tabs are management/reference areas the wizard draws on.
const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/plan", label: "Plan Week" },
  { href: "/", label: "Dashboard" },
  { href: "/recipes", label: "Recipes" },
  { href: "/staples", label: "Staples & Restock" },
  { href: "/receipts", label: "Receipts" },
  { href: "/items", label: "Items" },
  { href: "/store-layout", label: "Store Layout" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2">
        <span className="mr-4 font-semibold text-gray-900">Aldi Planner</span>
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const lead = item.href === "/plan";
          const className = active
            ? "rounded px-3 py-1.5 text-sm bg-gray-900 text-white"
            : lead
              ? "rounded px-3 py-1.5 text-sm font-medium text-green-700 ring-1 ring-green-600 hover:bg-green-50"
              : "rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900";
          return (
            <Link key={item.href} href={item.href} className={`${className} ${lead ? "mr-2" : ""}`}>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
