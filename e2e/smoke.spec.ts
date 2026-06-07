import { test, expect } from "@playwright/test";

// Every primary route loads and renders its heading. Catches build/seed/routing regressions fast.
const ROUTES: { label: string; path: string; heading: RegExp }[] = [
  { label: "Dashboard", path: "/", heading: /This Week/ },
  { label: "Grocery List", path: "/grocery-list", heading: /Grocery List/ },
  { label: "Meal Plan", path: "/meal-plan", heading: /Meal Plan/ },
  { label: "Recipes", path: "/recipes", heading: /Recipes/ },
  { label: "Staples & Restock", path: "/staples", heading: /Staples & Restock/ },
  { label: "Pantry", path: "/pantry", heading: /Pantry/ },
  { label: "Items", path: "/items", heading: /Items/ },
  { label: "History", path: "/history", heading: /History & Analytics/ },
];

test("dashboard renders seeded foundation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /This Week/ })).toBeVisible();
  await expect(page.getByText("Catalog items")).toBeVisible();
});

for (const { label, path, heading } of ROUTES) {
  test(`route ${path} loads`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}

test("top nav links navigate between sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Recipes", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole("heading", { level: 1, name: /Recipes/ })).toBeVisible();

  await page.getByRole("link", { name: "Pantry", exact: true }).click();
  await expect(page).toHaveURL(/\/pantry$/);
  await expect(page.getByRole("heading", { level: 1, name: /Pantry/ })).toBeVisible();
});
