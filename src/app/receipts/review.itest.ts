import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { importReceipt } from "@/app/receipts/import";
import { setLineMatch, createItemForLine, skipLine } from "@/app/receipts/review";

// Spec phase2 §6.2 / M2: matching runs at import (auto-match ≥0.85, else needs_review); the review
// queue confirms / creates / skips lines; confirming or creating teaches an alias so the same Aldi
// string auto-matches on the next import. Uses distinctive nonsense tokens so scores don't depend on
// whatever items already exist in the dev DB. Self-contained: tags rows and cleans up.

const TAG = `ITEST-M2-${Date.now()}`;
const itemIds: string[] = [];
const receiptIds: string[] = [];

let cheeseId = "";

const receipt1 = {
  store: `${TAG} A`,
  purchase_date: "2026-06-05",
  currency: "USD",
  total: 5.0,
  lines: [
    { raw_name: "SHRD ZYLO CHS", quantity: 1, line_total: 2.5 }, // no match yet → needs_review
    { raw_name: "ZQWVX BLARG", quantity: 1, line_total: 2.5 }, // no match → needs_review → skipped
  ],
};

const receipt2 = {
  store: `${TAG} B`,
  purchase_date: "2026-06-06",
  currency: "USD",
  total: 6.0,
  lines: [
    { raw_name: "SHRD ZYLO CHS", quantity: 1, line_total: 3.0 }, // now auto-matches via learned alias
    { raw_name: "NEWLY CREATED THING", quantity: 1, line_total: 3.0 }, // → create new item
  ],
};

beforeAll(async () => {
  const cheese = await prisma.item.create({
    data: { canonicalName: `${TAG} Cheese`, purchaseUnit: "each" },
    select: { id: true },
  });
  cheeseId = cheese.id;
  itemIds.push(cheeseId);
});

afterAll(async () => {
  // M3: matched lines now write observations (FK on itemId, SetNull on line delete) → clear first.
  await prisma.priceObservation.deleteMany({ where: { itemId: { in: itemIds } } });
  if (receiptIds.length) await prisma.receipt.deleteMany({ where: { id: { in: receiptIds } } });
  if (itemIds.length) await prisma.item.deleteMany({ where: { id: { in: itemIds } } }); // cascades aliases
  await prisma.$disconnect();
});

describe("receipt review queue (phase2 §6.2 / M2)", () => {
  it("imports unmatched lines as needs_review (no suggestion) and stays pending_review", async () => {
    const res = await importReceipt(JSON.stringify(receipt1));
    expect(res.status).toBe("imported");
    if (res.status !== "imported") return;
    receiptIds.push(res.receiptId);

    const saved = await prisma.receipt.findUnique({
      where: { id: res.receiptId },
      include: { lines: { orderBy: { id: "asc" } } },
    });
    expect(saved!.importStatus).toBe("pending_review");
    expect(saved!.lines.every((l) => l.matchStatus === "needs_review")).toBe(true);
    expect(saved!.lines.every((l) => l.matchedItemId === null)).toBe(true);

    // raw preserved verbatim after matching (§10 integrity).
    expect(saved!.rawImportJson).toEqual(receipt1);
    expect(saved!.lines.map((l) => l.rawName).sort()).toEqual(["SHRD ZYLO CHS", "ZQWVX BLARG"]);
  });

  it("confirming a match sets confirmed + confidence 1 and teaches an alias", async () => {
    const cheeseLine = await prisma.receiptLineItem.findFirstOrThrow({
      where: { receiptId: receiptIds[0], rawName: "SHRD ZYLO CHS" },
    });

    await setLineMatch(cheeseLine.id, cheeseId);

    const updated = await prisma.receiptLineItem.findUniqueOrThrow({ where: { id: cheeseLine.id } });
    expect(updated.matchStatus).toBe("confirmed");
    expect(updated.matchedItemId).toBe(cheeseId);
    expect(Number(updated.matchConfidence)).toBe(1);

    const alias = await prisma.itemAlias.findFirst({
      where: { itemId: cheeseId, aliasText: "shrd zylo chs" },
    });
    expect(alias).not.toBeNull();

    // The blarg line is still needs_review → receipt not yet completed.
    const r = await prisma.receipt.findUniqueOrThrow({ where: { id: receiptIds[0] } });
    expect(r.importStatus).toBe("pending_review");
  });

  it("skipping the last needs_review line completes the receipt", async () => {
    const blarg = await prisma.receiptLineItem.findFirstOrThrow({
      where: { receiptId: receiptIds[0], rawName: "ZQWVX BLARG" },
    });

    await skipLine(blarg.id);

    const updated = await prisma.receiptLineItem.findUniqueOrThrow({ where: { id: blarg.id } });
    expect(updated.matchStatus).toBe("unmatched");
    expect(updated.matchedItemId).toBeNull();

    const r = await prisma.receipt.findUniqueOrThrow({ where: { id: receiptIds[0] } });
    expect(r.importStatus).toBe("completed");
  });

  it("re-importing the same raw_name auto-matches via the learned alias (the learning loop)", async () => {
    const res = await importReceipt(JSON.stringify(receipt2));
    expect(res.status).toBe("imported");
    if (res.status !== "imported") return;
    receiptIds.push(res.receiptId);

    const cheeseLine = await prisma.receiptLineItem.findFirstOrThrow({
      where: { receiptId: res.receiptId, rawName: "SHRD ZYLO CHS" },
    });
    expect(cheeseLine.matchStatus).toBe("auto_matched");
    expect(cheeseLine.matchedItemId).toBe(cheeseId);
    expect(Number(cheeseLine.matchConfidence)).toBe(1);
  });

  it("creating a new item for a line attaches it, marks new_item, and learns its alias", async () => {
    const line = await prisma.receiptLineItem.findFirstOrThrow({
      where: { receiptId: receiptIds[1], rawName: "NEWLY CREATED THING" },
    });

    await createItemForLine(line.id, {
      canonicalName: `${TAG} Newly Created Thing`,
      purchaseUnit: "each",
      defaultSectionId: null,
      food: true,
      aldiFriendly: true,
    });

    const updated = await prisma.receiptLineItem.findUniqueOrThrow({ where: { id: line.id } });
    expect(updated.matchStatus).toBe("new_item");
    expect(updated.matchedItemId).not.toBeNull();
    itemIds.push(updated.matchedItemId!); // cleanup

    const alias = await prisma.itemAlias.findFirst({
      where: { itemId: updated.matchedItemId!, aliasText: "newly created thing" },
    });
    expect(alias).not.toBeNull();

    // Both lines resolved → receipt completed.
    const r = await prisma.receipt.findUniqueOrThrow({ where: { id: receiptIds[1] } });
    expect(r.importStatus).toBe("completed");
  });

  it("creating an item with a duplicate canonical name reports an error, leaving the line unresolved", async () => {
    const res = await importReceipt(
      JSON.stringify({
        store: `${TAG} C`,
        purchase_date: "2026-06-07",
        currency: "USD",
        total: 1.0,
        lines: [{ raw_name: "DUP NAME LINE", quantity: 1, line_total: 1.0 }],
      }),
    );
    expect(res.status).toBe("imported");
    if (res.status !== "imported") return;
    receiptIds.push(res.receiptId);

    const line = await prisma.receiptLineItem.findFirstOrThrow({
      where: { receiptId: res.receiptId },
    });

    // `${TAG} Cheese` already exists (created in beforeAll) → P2002 surfaces as a friendly error,
    // not an uncaught throw, and the line is left for the user to retry or pick via Change.
    const result = await createItemForLine(line.id, {
      canonicalName: `${TAG} Cheese`,
      purchaseUnit: "each",
      defaultSectionId: null,
      food: true,
      aldiFriendly: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already exists/i);

    const unchanged = await prisma.receiptLineItem.findUniqueOrThrow({ where: { id: line.id } });
    expect(unchanged.matchStatus).toBe("needs_review");
  });
});
