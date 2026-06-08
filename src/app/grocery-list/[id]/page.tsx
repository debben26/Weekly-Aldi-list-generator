import GroceryListEditor from "@/components/GroceryListEditor";

export const dynamic = "force-dynamic";

export default async function GroceryListDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  return <GroceryListEditor listId={id} error={error} />;
}
