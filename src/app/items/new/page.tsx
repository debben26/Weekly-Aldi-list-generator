import { prisma } from "@/lib/prisma";
import ItemForm from "@/components/ItemForm";
import { createItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const sections = await prisma.storeSection.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New item</h1>
      <ItemForm action={createItem} sections={sections} submitLabel="Create item" />
    </div>
  );
}
