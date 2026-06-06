"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultStore } from "@/lib/context";
import { OTHER_SECTION_NAME } from "@/lib/constants";

// Section management (spec 6.1): add, rename, reorder, deactivate. The Other / Unassigned
// section is the guaranteed fallback (spec 5.2) and cannot be renamed or deactivated.

function backWithError(message: string): never {
  redirect(`/store-layout?error=${encodeURIComponent(message)}`);
}

export async function createSection(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) backWithError("Section name is required.");

  const store = await getDefaultStore();
  const existing = await prisma.storeSection.findUnique({
    where: { storeId_name: { storeId: store.id, name } },
  });
  if (existing) backWithError(`A section named "${name}" already exists.`);

  const last = await prisma.storeSection.findFirst({
    where: { storeId: store.id },
    orderBy: { sortOrder: "desc" },
  });
  await prisma.storeSection.create({
    data: { storeId: store.id, name, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  revalidatePath("/store-layout");
}

export async function renameSection(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) backWithError("Section name is required.");

  const section = await prisma.storeSection.findUnique({ where: { id } });
  if (!section) backWithError("Section not found.");
  if (section.name === OTHER_SECTION_NAME) {
    backWithError("The Other / Unassigned section cannot be renamed.");
  }

  const clash = await prisma.storeSection.findUnique({
    where: { storeId_name: { storeId: section.storeId, name } },
  });
  if (clash && clash.id !== id) backWithError(`A section named "${name}" already exists.`);

  await prisma.storeSection.update({ where: { id }, data: { name } });
  revalidatePath("/store-layout");
}

export async function moveSection(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const section = await prisma.storeSection.findUnique({ where: { id } });
  if (!section) backWithError("Section not found.");

  // Find the adjacent section in the current order and swap sort positions.
  const neighbor = await prisma.storeSection.findFirst({
    where:
      direction === "up"
        ? { storeId: section.storeId, sortOrder: { lt: section.sortOrder } }
        : { storeId: section.storeId, sortOrder: { gt: section.sortOrder } },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) {
    revalidatePath("/store-layout"); // already at an end; nothing to do
    return;
  }

  await prisma.$transaction([
    prisma.storeSection.update({ where: { id: section.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.storeSection.update({ where: { id: neighbor.id }, data: { sortOrder: section.sortOrder } }),
  ]);
  revalidatePath("/store-layout");
}

export async function setSectionActive(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const section = await prisma.storeSection.findUnique({ where: { id } });
  if (!section) backWithError("Section not found.");
  if (!active && section.name === OTHER_SECTION_NAME) {
    backWithError("The Other / Unassigned section must stay active.");
  }

  await prisma.storeSection.update({ where: { id }, data: { active } });
  revalidatePath("/store-layout");
}
