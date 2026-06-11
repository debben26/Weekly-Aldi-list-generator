import { test, expect } from "@playwright/test";
import { createItem, createRecipe, futureWeek, uid } from "./helpers";

// The core journey: item -> recipe (with a mapped ingredient) -> meal plan -> grocery list ->
// check off an item -> complete trip -> see it frozen in history.
test("full weekly planning journey end to end", async ({ page }) => {
  const run = uid();
  const itemName = `E2E Beef ${run}`;
  const recipeTitle = `E2E Tacos ${run}`;

  // 1. Catalog item.
  await createItem(page, itemName, "lb");

  // 2. Recipe (lands on its detail page).
  await createRecipe(page, recipeTitle);

  // 3. Add an ingredient mapped to the item — this is what flows into the grocery list.
  await page.locator('form:has(input[name="newItemName"]) select[name="itemId"]').selectOption({ label: itemName });
  await page.locator('form:has(input[name="newItemName"]) input[name="quantity"]').fill("1");
  await page.locator('form:has(input[name="newItemName"]) input[name="recipeUnit"]').fill("lb");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: /Ingredients \(1\)/ })).toBeVisible();

  // 4. Create a meal plan for a unique future week -> redirects to the plan detail page.
  // (Completing a trip freezes its week, so a fresh week keeps this test re-runnable.)
  await page.goto("/meal-plan");
  await page.locator('input[name="weekStartDate"]').fill(futureWeek());
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page).toHaveURL(/\/meal-plan\/[a-z0-9]+$/);

  // 5. Add the recipe to the plan.
  await page.locator('form:has(button:has-text("Add")) select[name="recipeId"]').selectOption({ label: recipeTitle });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Selected recipes \(1\)/ })).toBeVisible();
  await expect(page.getByText(recipeTitle).first()).toBeVisible();

  // 6. Generate the grocery list -> redirects to the list detail page.
  await page.getByRole("button", { name: "Generate grocery list" }).click();
  await expect(page).toHaveURL(/\/grocery-list\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1, name: /Grocery List/ })).toBeVisible();
  // The mapped recipe ingredient surfaces as a list ROW. (A bare getByText would match the
  // order-estimate panel's collapsed per-item breakdown first, which is hidden.)
  await expect(page.getByRole("listitem").filter({ hasText: itemName }).first()).toBeVisible();

  // 7. Check off the first item.
  const firstToggle = page.getByRole("button", { name: "toggle checked" }).first();
  await firstToggle.click();
  await expect(page.getByText(/1 checked/)).toBeVisible();

  // 8. Complete the trip -> redirects to history with a confirmation banner.
  await page.getByRole("button", { name: "Complete trip" }).click();
  await expect(page).toHaveURL(/\/history\?completed=/);
  await expect(page.getByText("Trip completed and frozen to history.")).toBeVisible();
  await expect(page.getByText("Completed trips")).toBeVisible();
});
