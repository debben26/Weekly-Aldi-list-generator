"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = [
  { slug: "meals", label: "Meals" },
  { slug: "staples", label: "Weekly Staples" },
  { slug: "restock", label: "Restock" },
  { slug: "final", label: "Final List" },
];

// Linear progress strip shared across the four wizard steps. Phase 1 allows free navigation
// between steps; the active step is highlighted from the current path.
export default function StepNav({ planId }: { planId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {STEPS.map((step, i) => {
        const href = `/plan/${planId}/${step.slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <span key={step.slug} className="flex items-center gap-1">
            {i > 0 ? <span className="text-gray-300">→</span> : null}
            <Link
              href={href}
              className={`rounded px-3 py-1.5 ${
                active
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="mr-1.5 text-xs opacity-60">{i + 1}</span>
              {step.label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
