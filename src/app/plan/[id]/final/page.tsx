import Link from "next/link";
import GroceryListEditor from "@/components/GroceryListEditor";
import { getPlanWithList } from "../data";

export const dynamic = "force-dynamic";

export default async function FinalStep({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: planId } = await params;
  const { error } = await searchParams;
  const data = await getPlanWithList(planId);

  if (!data) return null;
  if (!data.list) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">
          Pick your meals first — your grocery list is created when you use them.
        </p>
        <Link
          href={`/plan/${planId}/meals`}
          className="mt-3 inline-block rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          ← Back to Meals
        </Link>
      </div>
    );
  }

  return <GroceryListEditor listId={data.list.id} error={error} />;
}
