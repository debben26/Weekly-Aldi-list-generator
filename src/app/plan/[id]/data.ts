import { prisma } from "@/lib/prisma";
import { getDefaultStore } from "@/lib/context";

// Resolve a plan plus the draft (non-completed) grocery list for its week. The list is created at
// "Use These Meals"; staples/restock/final steps read and mutate it. Returns null if the plan is gone.
export async function getPlanWithList(planId: string) {
  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    select: { id: true, householdId: true, weekStartDate: true },
  });
  if (!plan) return null;

  const store = await getDefaultStore();
  const list = await prisma.shoppingList.findFirst({
    where: {
      householdId: plan.householdId,
      storeId: store.id,
      weekStart: plan.weekStartDate,
      status: { not: "completed" },
    },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { sources: true } } },
  });

  return { plan, store, list };
}
