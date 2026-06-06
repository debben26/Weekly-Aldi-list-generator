import { prisma } from "@/lib/prisma";

// Phase 1 is single-household / single-store. These helpers resolve the active context until
// real multi-user/multi-store selection arrives in Phase 2.

export async function getDefaultStore() {
  const store = await prisma.store.findFirst({
    where: { isDefault: true },
    orderBy: { createdAt: "asc" },
  });
  if (!store) throw new Error("No default store found — run `npm run db:seed`.");
  return store;
}

export async function getDefaultHousehold() {
  const household = await prisma.household.findFirst({ orderBy: { createdAt: "asc" } });
  if (!household) throw new Error("No household found — run `npm run db:seed`.");
  return household;
}
