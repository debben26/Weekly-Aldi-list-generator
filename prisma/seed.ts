// Seed: cold-start data (spec 6.0 + Appendix A). One user, one household, one default Aldi
// store, the default ordered sections, and the ~100-item starter catalog. Idempotent — every
// record is upserted on a natural/stable key so re-running is safe.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_SECTION_ORDER } from "../src/lib/constants";
import { STARTER_CATALOG } from "../src/lib/seed-data";
import { dimensionForPurchaseUnit } from "../src/services/UnitService";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const HOUSEHOLD_ID = "default-household";
const STORE_ID = "default-store";

async function main() {
  // 5.1 Identity
  const user = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: { email: "owner@example.com", name: "Household Owner" },
  });

  const household = await prisma.household.upsert({
    where: { id: HOUSEHOLD_ID },
    update: {},
    create: { id: HOUSEHOLD_ID, name: "Our Household" },
  });

  await prisma.householdMember.upsert({
    where: { userId_householdId: { userId: user.id, householdId: household.id } },
    update: {},
    create: { userId: user.id, householdId: household.id, role: "owner" },
  });

  // 5.2 Store + ordered sections
  const store = await prisma.store.upsert({
    where: { id: STORE_ID },
    update: {},
    create: { id: STORE_ID, brand: "Aldi", name: "My Aldi", isDefault: true },
  });

  const sectionIdByName = new Map<string, string>();
  for (let i = 0; i < DEFAULT_SECTION_ORDER.length; i++) {
    const name = DEFAULT_SECTION_ORDER[i];
    const section = await prisma.storeSection.upsert({
      where: { storeId_name: { storeId: store.id, name } },
      update: { sortOrder: i },
      create: { storeId: store.id, name, sortOrder: i },
    });
    sectionIdByName.set(name, section.id);
  }

  // 5.3 Item catalog
  for (const entry of STARTER_CATALOG) {
    const sectionId = sectionIdByName.get(entry.section);
    if (!sectionId) {
      throw new Error(
        `Catalog item "${entry.name}" references unknown section "${entry.section}"`,
      );
    }
    await prisma.item.upsert({
      where: { canonicalName: entry.name },
      update: {
        defaultSectionId: sectionId,
        purchaseUnit: entry.purchaseUnit,
        dimension: dimensionForPurchaseUnit(entry.purchaseUnit),
        aldiFriendly: entry.aldiFriendly,
        recipeToPurchase: entry.recipeToPurchase ?? undefined,
      },
      create: {
        canonicalName: entry.name,
        defaultSectionId: sectionId,
        purchaseUnit: entry.purchaseUnit,
        dimension: dimensionForPurchaseUnit(entry.purchaseUnit),
        aldiFriendly: entry.aldiFriendly,
        recipeToPurchase: entry.recipeToPurchase ?? undefined,
      },
    });
  }

  const itemCount = await prisma.item.count();
  const sectionCount = await prisma.storeSection.count({ where: { storeId: store.id } });
  console.log(
    `Seed complete: 1 user, 1 household, store "${store.name}", ${sectionCount} sections, ${itemCount} items.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
