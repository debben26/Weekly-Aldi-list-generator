import { expect, type Page } from "@playwright/test";

// Short unique suffix so repeated runs against the shared dev DB never collide on unique names.
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// A far-future, randomized week-start date (YYYY-MM-DD). Completing a trip permanently freezes
// that week (the generator refuses to regenerate it), so each run must use a fresh week to stay
// re-runnable against the shared dev DB.
export function futureWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1000 + Math.floor(Math.random() * 20000));
  return d.toISOString().slice(0, 10);
}

// Create an item via the UI and return its canonical name. Lands back on /items.
export async function createItem(
  page: Page,
  name: string,
  purchaseUnit = "bag",
): Promise<string> {
  await page.goto("/items/new");
  await page.locator('input[name="canonicalName"]').fill(name);
  await page.locator('input[name="purchaseUnit"]').fill(purchaseUnit);
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
  return name;
}

// Create a recipe via the UI and return its detail URL (the action redirects to /recipes/<id>).
export async function createRecipe(page: Page, title: string): Promise<string> {
  await page.goto("/recipes/new");
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible();
  return page.url();
}
