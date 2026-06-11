// One-off cleanup: remove data created by the e2e/integration test runs from the LOCAL Docker
// database, restoring it to its seeded state (user/household/store/sections/starter catalog).
// Refuses to run against any non-local database.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL ?? "";
const hostname = new URL(url).hostname;
if (hostname !== "localhost" && hostname !== "127.0.0.1") {
  throw new Error(`Refusing to clean a non-local database (host "${hostname}").`);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  // Everything beyond the seed is test data on this DB. Delete in dependency order; cascades
  // handle child rows (list items/sources, snapshot items, recipe ingredients, receipt lines).
  const counts = {
    priceObservations: (await prisma.priceObservation.deleteMany()).count,
    receipts: (await prisma.receipt.deleteMany()).count,
    tripSnapshots: (await prisma.tripSnapshot.deleteMany()).count,
    shoppingLists: (await prisma.shoppingList.deleteMany()).count,
    mealPlans: (await prisma.mealPlan.deleteMany()).count,
    recipes: (await prisma.recipe.deleteMany()).count,
    stapleRules: (await prisma.stapleRule.deleteMany()).count,
    pantryItems: (await prisma.pantryItem.deleteMany()).count,
    itemAliases: (await prisma.itemAlias.deleteMany()).count,
    testItems: (
      await prisma.item.deleteMany({
        where: {
          OR: [
            { canonicalName: { startsWith: "E2E " } },
            { canonicalName: { startsWith: "e2e " } },
            { canonicalName: { startsWith: "ITEST" } },
          ],
        },
      })
    ).count,
  };
  console.log("Deleted:", counts);
  console.log("Remaining items (should be the starter catalog):", await prisma.item.count());
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
