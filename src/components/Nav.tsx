"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Section 7.1 navigation. "Items" is added for the catalog view (M2 expands it to full CRUD).
const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/grocery-list", label: "Grocery List" },
  { href: "/meal-plan", label: "Meal Plan" },
  { href: "/recipes", label: "Recipes" },
  { href: "/staples", label: "Staples & Restock" },
  { href: "/pantry", label: "Pantry" },
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
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-3 py-1.5 text-sm ${
                active
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
