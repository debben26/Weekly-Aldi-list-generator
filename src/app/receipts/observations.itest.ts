import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { importReceipt } from "@/app/receipts/import";
import { setLineMatch, skipLine } from "@/app/receipts/review";

// Spec phase2 §6.3 / M3: a matched receipt line writes a receipt-sourced (paid) PriceObservation;
// unmatched/needs_review lines write none, and re-matching never leaves stale/duplicate rows. Uses
// distinctive nonsense tokens so matching doesn't depend on whatever items the dev DB already has.

const TAG = `ITEST-M3-${Date.now()}`;
const itemIds: string[] = [];
const receiptIds: string[] = [];

let milkId = "";
let breadId = "";

const receipt = {
  store: `${TAG} A`,
  purchase_date: "2026-06-05",
  currency: "USD",
  total: 4.29,
  lines: [
    { raw_name: "ZWHOLE ZMILK GAL", quantity: 1, unit_price: 2.79, line_total: 2.79 }, // auto-match
    { raw_name: "ZZQXX UNKNOWN", quantity: 1, line_total: 1.5 }, // needs_review → confirm/skip
  ],
};

beforeAll(async () => {
  const milk = await prisma.item.create({
    data: {
      canonicalName: `${TAG} Milk`,
      purchaseUnit: "gallon",
      aliases: { create: { aliasText: "zwhole zmilk gal" } }, // makes the milk line auto-match
    },
    select: { id: true },
  });
  milkId = milk.id;
  const bread = await prisma.item.create({
    data: { canonicalName: `${TAG} Bread`, purchaseUnit: "loaf" },
    select: { id: true },
  });
  breadId = bread.id;
  itemIds.push(milkId, breadId);
});

afterAll(async () => {
  // Observations reference items (FK) and survive line deletion (SetNull), so clear them first.
  await prisma.priceObservation.deleteMany({ where: { itemId: { in: itemIds } } });
  if (receiptIds.length) await prisma.receipt.deleteMany({ where: { id: { in: receiptIds } } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } }); // cascades aliases
  await prisma.$disconnect();
});

async function lineByName(receiptId: string, rawName: string) {
  return prisma.receiptLineItem.findFirstOrThrow({ where: { receiptId, rawName } });
}

describe("receipt price observations (phase2 §6.3 / M3)", () => {
  it("an auto-matched line writes a receipt-sourced paid observation; an unmatched line writes none", async () => {
    const res = await importReceipt(JSON.stringify(receipt));
    expect(res.status).toBe("imported");
    if (res.status !== "imported") return;
    receiptIds.push(res.receiptId);

    const milkLine = await lineByName(res.receiptId, "ZWHOLE ZMILK GAL");
    expect(milkLine.matchStatus).toBe("auto_matched");

    const obs = await prisma.priceObservation.findMany({
      where: { receiptLineItemId: milkLine.id },
    });
    expect(obs).toHaveLength(1);
    const o = obs[0];
    expect(o.sourceType).toBe("receipt");
    expect(o.itemId).toBe(milkId);
    expect(Number(o.amount)).toBe(2.79);
    expect(Number(o.unitPrice)).toBe(2.79);
    expect(o.confidence).toBe("high");
    expect(o.quantityBasis).toBe("1 gallon");
    expect(o.observedDate.toISOString().slice(0, 10)).toBe("2026-06-05");

    // The needs_review line is only a suggestion → no observation yet.
    const unknownLine = await lineByName(res.receiptId, "ZZQXX UNKNOWN");
    const none = await prisma.priceObservation.count({
      where: { receiptLineItemId: unknownLine.id },
    });
    expect(none).toBe(0);
  });

  it("confirming a line writes its observation; re-pointing it doesn't duplicate", async () => {
    const line = await lineByName(receiptIds[0], "ZZQXX UNKNOWN");

    await setLineMatch(line.id, breadId);
    let obs = await prisma.priceObservation.findMany({ where: { receiptLineItemId: line.id } });
    expect(obs).toHaveLength(1);
    expect(obs[0].itemId).toBe(breadId);
    expect(Number(obs[0].amount)).toBe(1.5);

    // Change the match to a different item → still exactly one observation, now re-pointed.
    await setLineMatch(line.id, milkId);
    obs = await prisma.priceObservation.findMany({ where: { receiptLineItemId: line.id } });
    expect(obs).toHaveLength(1);
    expect(obs[0].itemId).toBe(milkId);
  });

  it("skipping a line removes its observation (and leaves other lines' observations intact)", async () => {
    const line = await lineByName(receiptIds[0], "ZZQXX UNKNOWN");

    await skipLine(line.id);
    const gone = await prisma.priceObservation.count({ where: { receiptLineItemId: line.id } });
    expect(gone).toBe(0);

    // The milk line's observation is untouched.
    const milkLine = await lineByName(receiptIds[0], "ZWHOLE ZMILK GAL");
    const stillThere = await prisma.priceObservation.count({
      where: { receiptLineItemId: milkLine.id },
    });
    expect(stillThere).toBe(1);
  });
});
