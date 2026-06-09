import { test, expect } from "@playwright/test";
import { createRecipe, uid } from "./helpers";

test("create a recipe and land on its detail page", async ({ page }) => {
  const title = `E2E Recipe ${uid()}`;
  await createRecipe(page, title);
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Ingredients \(0\)/ })).toBeVisible();
});

test("add an ingredient to a recipe", async ({ page }) => {
  const title = `E2E Recipe ${uid()}`;
  await createRecipe(page, title);

  const itemName = `e2e beef ${uid()}`;
  await page.locator('input[name="newItemName"]').fill(itemName);
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("heading", { name: /Ingredients \(1\)/ })).toBeVisible();
  await expect(page.getByText(itemName).first()).toBeVisible();
});
