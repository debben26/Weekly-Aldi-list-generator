import { test, expect } from "@playwright/test";
import { createItem, uid } from "./helpers";

// Items / staples / pantry coverage. Each test creates its own item so it is self-contained
// against the shared dev DB.

test("create an item and see it in the catalog", async ({ page }) => {
  const name = `E2E Item ${uid()}`;
  await createItem(page, name, "bag");
  // Grouped under its section list on /items.
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});

test("create item validates required name", async ({ page }) => {
  await page.goto("/items/new");
  await page.locator('input[name="purchaseUnit"]').fill("bag");
  await page.getByRole("button", { name: "Create item" }).click();
  // Native required-field validation keeps us on the form (no redirect to /items).
  await expect(page).toHaveURL(/\/items\/new$/);
});

test("edit an item catalog price inline", async ({ page }) => {
  const name = `E2E Price ${uid()}`;
  await createItem(page, name, "bag");

  const price = page.getByLabel(`${name} price`);
  await price.fill("4.29");
  await page.getByRole("button", { name: `Save price for ${name}` }).click();
  await expect(price).toHaveValue("4.29");

  await page.reload();
  await expect(page.getByLabel(`${name} price`)).toHaveValue("4.29");
});

test("add a weekly staple rule for an item", async ({ page }) => {
  const name = `E2E Staple ${uid()}`;
  await createItem(page, name, "bag");

  await page.goto("/staples");
  await page.locator('select[name="itemId"]').selectOption({ label: name });
  await page.locator('select[name="ruleType"]').selectOption("weekly");
  await page.getByRole("button", { name: "Add rule" }).click();

  // Appears in the weekly staples list with a Deactivate toggle.
  const row = page.locator("li", { hasText: name });
  await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();
});

test("set a pantry status for an item", async ({ page }) => {
  const name = `E2E Pantry ${uid()}`;
  await createItem(page, name, "bag");

  await page.goto("/pantry");
  await page.locator('select[name="itemId"]').selectOption({ label: name });
  await page.locator('select[name="status"]').selectOption("have");
  await page.getByRole("button", { name: "Save status" }).click();

  const row = page.locator("li", { hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByText("have", { exact: true }).first()).toBeVisible();
});
