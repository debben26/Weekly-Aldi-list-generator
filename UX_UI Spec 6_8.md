# Meals-First UX/UI Flow — Implementation Spec

## 1. Feature Overview

The application should guide the user through weekly grocery planning by starting with meal selection before moving into staples, restock suggestions, and final list review.

The first primary tab/workflow the user interacts with should be the **Meals** tab. The goal of this flow is to help the user quickly choose meals for the week, approve or modify suggested meal packages, and then generate the grocery list from those meals.

Primary flow:

```text
Meals → Weekly Staples → Restock Items → Final List
```

This spec focuses on the Meals-first UX/UI flow. Some generation logic is intentionally marked as TBD for later refinement.

---

## 2. Goals

### Primary Goals

The Meals-first flow should allow the user to:

1. Choose how many meals they want to plan for the week.
2. Receive one or more suggested meal packages.
3. Review each suggested meal individually.
4. Approve, remove, regenerate, or swap meals.
5. Submit the selected meal package when satisfied.
6. Continue to staples, restock items, and final list review.

### UX Goals

The experience should feel:

- Fast
- Flexible
- Easy to change
- Not overly rigid
- Helpful without being annoying
- Familiar for a weekly grocery planning habit

The user should not feel locked into the app’s suggestions. The user should be able to partially accept a plan, swap specific meals, and move forward whenever they are ready.

---

## 3. High-Level User Flow

### Step 1 — User opens planner

The user starts on the **Meals** tab.

Recommended tab order:

1. **Meals**
2. **Weekly Staples**
3. **Restock Items**
4. **Final List**

The app should either default to the Meals tab or guide the user there first when starting a new weekly plan.

### Step 2 — User enters number of meals

The user should be prompted with something like:

```text
How many meals do you want to plan this week?
```

Possible input types:

- Number selector
- Stepper control
- Dropdown
- Text input with validation

Recommended default:

```text
4 meals
```

Example UI:

```text
How many meals do you want this week?

[-] 4 [+]
```

Validation:

- Minimum: 1
- Maximum: TBD, probably 10 or 14
- Default: 3 or 4
- User should not be able to submit a blank or invalid value

### Step 3 — App generates meal package options

After the user enters the desired number of meals, the app presents meal package options.

A **meal package** is a suggested group of meals for the week.

Example:

```text
Meal Package Option 1

1. Chicken tacos
2. Spaghetti with meat sauce
3. Sheet pan sausage and vegetables
4. Breakfast-for-dinner burritos
```

A package should contain the same number of meals requested by the user.

If the user requested 4 meals, each package should have 4 meals.

---

## 4. Meal Package Generation Requirements

### 4.1 Source of Meal Suggestions

Meal package suggestions should primarily come from the user’s internal meal database.

The app may occasionally suggest a new recipe, but the main source should be known meals that already exist in the user’s saved meal database.

Initial generation logic is TBD, but likely future factors include:

- User’s saved meals
- Past meal history
- Meal frequency
- Favorite meals
- Seasonal fit
- Weather
- Aldi ingredient availability
- Estimated cost
- Prep time
- Variety across proteins/cuisines
- Family preferences
- Avoiding recently repeated meals
- Ingredients already on hand
- Historical purchase behavior

For now, the implementation can start simple and become smarter over time.

### 4.2 New Recipe Suggestions

The app should be able to include occasional new recipe suggestions.

This should probably be controlled by a setting later, such as:

```text
Include new recipe ideas?
[ ] Never
[ ] Occasionally
[ ] Often
```

Initial implementation may hardcode this behavior or leave it disabled until recipe discovery is built.

### 4.3 Number of Meal Package Options

TBD.

Potential options:

- Show 1 package at a time
- Show 3 package options
- Show a “Generate another package” button

Recommended Phase 1 approach:

Show **one suggested package** and allow the user to regenerate individual meals or the full package.

This keeps the UI simpler.

---

## 5. Meal Card Requirements

Each meal in the package should be displayed as an individual card.

### 5.1 Meal Card Content

Each meal card should include:

- Meal name
- Short description, optional
- Estimated servings, optional
- Estimated prep/cook time, optional
- Main ingredients, optional
- Source indicator:
  - Saved meal
  - New suggestion
- Optional tags:
  - Quick
  - Family favorite
  - Budget-friendly
  - Uses pantry items
  - Good for leftovers
  - New recipe

Example:

```text
Chicken Tacos

Saved Meal
Prep: 15 min | Cook: 20 min
Main ingredients: chicken, tortillas, cheese, lettuce, salsa

[Approve] [Remove] [New Suggestion] [Swap with My Meal]
```

---

## 6. Meal-Level User Actions

Each meal should have four main interaction options:

1. **Approve**
2. **Remove**
3. **Give me new suggestion**
4. **Swap with my meal**

### 6.1 Approve Meal

#### Description

The user can approve a suggested meal.

#### Behavior

When the user clicks **Approve**:

- The meal is marked as accepted.
- The card should visually indicate that it has been approved.
- The meal remains in the package.
- Its ingredients are eligible to be included in the final grocery list.

Possible UI states:

```text
[Approved ✓]
```

or

```text
Status: Approved
```

#### Notes

Approval should not necessarily be required before the user submits the package. If a meal is still present in the package, it can be treated as selected unless removed.

Recommended behavior:

- Meals are included by default.
- Approve is useful as a confirmation marker, but not strictly required.

### 6.2 Remove Meal

#### Description

The user can remove a meal from the current package.

#### Behavior

When the user clicks **Remove**:

- The meal is removed from the package or marked as excluded.
- The app should reduce the selected meal count by 1.
- The user should be able to continue with fewer meals if desired.
- The user should also have the option to add or regenerate a replacement meal.

Possible options after removal:

```text
Meal removed.

[Add another suggestion] [Search my meals]
```

#### Important Requirement

Removing a meal should not delete it from the user’s meal database.

It only removes it from the current weekly package.

### 6.3 Give Me New Suggestion

#### Description

The user can replace a specific meal with a new suggested meal.

#### Behavior

When the user clicks **Give me new suggestion**:

- The app should generate a replacement meal.
- The replacement should appear in the same position in the package.
- The old meal should be removed from the current package.
- The replacement should ideally avoid repeating the same meal again immediately.

Example:

Before:

```text
Meal 2: Spaghetti
```

User clicks:

```text
Give me new suggestion
```

After:

```text
Meal 2: Chicken stir fry
```

#### Replacement Logic

Initial logic may be simple:

- Pick another meal from the user’s saved database.
- Exclude meals already in the current package.
- Exclude the meal that was just replaced.

Future logic may consider:

- Weather
- Cost
- Ingredients
- Nutrition
- Prep time
- Meal history
- User likes/dislikes

### 6.4 Swap with My Meal

#### Description

The user can manually replace a suggested meal with one from their saved meal database.

#### Behavior

When the user clicks **Swap with my meal**:

- A search interface should appear.
- The user can search within their saved meal database.
- Matching meals should be returned as selectable options.
- Selecting a meal replaces the current meal in the package.

Example flow:

```text
User clicks: Swap with my meal

Search box appears:
[ Search my meals... ]

User types:
"taco"

Results:
- Chicken tacos
- Beef taco bowls
- Taco soup

User selects:
Beef taco bowls

Current meal is replaced with:
Beef taco bowls
```

#### Search Requirements

The search should query the user’s saved meal database.

Search should match against:

- Meal name
- Tags
- Ingredients, optional
- Cuisine type, optional
- Notes, optional

Phase 1 can search by meal name only.

#### Empty Search Results

If no results are found, the UI should show:

```text
No matching meals found.

[Clear search] [Create new meal]
```

“Create new meal” can be a future feature if not available yet.

---

## 7. Submit Meal Package

### 7.1 Submit Behavior

The user should be able to submit their meal package at any point.

The package does not need to be perfect or fully approved.

When the user clicks **Submit Meal Package** or **Continue**, the selected meals are saved to the current weekly plan.

Example button text:

```text
Continue to Weekly Staples
```

or

```text
Use These Meals
```

Recommended label:

```text
Use These Meals
```

Then the app moves the user to the **Weekly Staples** section.

### 7.2 Requirements Before Submit

The app should require at least one selected meal before proceeding.

If no meals are selected, show:

```text
Choose at least one meal before continuing.
```

Possible validation:

- At least one meal must be present.
- Removed meals are not included.
- Approved and unapproved visible meals are included.
- User can continue with fewer meals than originally requested.

### 7.3 What Happens on Submit

When the user submits the meal package, the app should:

1. Save the selected meals to the current weekly plan.
2. Pull ingredient lists for each selected meal.
3. Combine duplicate ingredients where possible.
4. Prepare the grocery list draft.
5. Move the user to the next workflow section.

The app should not finalize the grocery list yet.

The grocery list should remain editable later.

---

## 8. Weekly Staples Step

After submitting meals, the user moves to **Weekly Staples**.

This section is not fully specified here, but it should allow the user to review commonly purchased weekly items.

Examples:

- Milk
- Eggs
- Bread
- Bananas
- Yogurt
- Lunch meat
- Cheese
- Coffee creamer

The user should be able to include or exclude these from the current grocery list.

Possible actions:

- Add item
- Remove item
- Increase quantity
- Decrease quantity
- Skip this section

---

## 9. Restock Items Step

After Weekly Staples, the user moves to **Restock Items**.

This section should suggest items the user may need to restock based on historical purchase data and/or manually configured staple intervals.

Examples:

- Olive oil
- Peanut butter
- Flour
- Rice
- Cereal
- Granola bars
- Diapers
- Wipes
- Paper towels
- Dish soap

This step is separate from weekly staples because these are not necessarily bought every week.

The user should be able to include or exclude suggested restock items before moving to the final list.

---

## 10. Final List Review Step

After Meals, Weekly Staples, and Restock Items, the user reaches the final grocery list.

The final list should be grouped by store/category/section.

Example sections:

- Produce
- Meat
- Dairy
- Frozen
- Pantry
- Snacks
- Breakfast
- Household
- Baby
- Other

The user should be able to edit the final list before shopping or exporting.

This connects to the separate final-list control feature already captured.

Each final list item should eventually support:

1. Remove item
2. Increase quantity by 1
3. Move item to section above
4. Move item to section below

When users move items between categories, the app should save learned category overrides for the future.

---

## 11. Data Model Considerations

### 11.1 Weekly Plan

A weekly plan represents one planning session.

Example structure:

```json
{
  "weeklyPlanId": "abc123",
  "weekStartDate": "2026-06-08",
  "requestedMealCount": 4,
  "selectedMeals": [],
  "weeklyStaples": [],
  "restockItems": [],
  "finalList": [],
  "status": "draft"
}
```

### 11.2 Meal

A meal is a saved recipe or meal idea.

Example structure:

```json
{
  "mealId": "meal_001",
  "name": "Chicken Tacos",
  "description": "Simple chicken tacos with tortillas, cheese, lettuce, and salsa.",
  "source": "saved",
  "tags": ["quick", "family favorite"],
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 20,
  "ingredients": [
    {
      "ingredientId": "ing_001",
      "name": "chicken breast",
      "quantity": 1.5,
      "unit": "lb",
      "category": "Meat"
    },
    {
      "ingredientId": "ing_002",
      "name": "flour tortillas",
      "quantity": 1,
      "unit": "package",
      "category": "Bakery"
    }
  ]
}
```

### 11.3 Meal Package

A meal package is a temporary generated group of meals.

Example structure:

```json
{
  "mealPackageId": "pkg_001",
  "requestedMealCount": 4,
  "meals": [
    {
      "mealId": "meal_001",
      "status": "suggested",
      "position": 1
    },
    {
      "mealId": "meal_002",
      "status": "approved",
      "position": 2
    }
  ]
}
```

Possible statuses:

- suggested
- approved
- removed
- swapped
- replaced

### 11.4 Meal Package Item

Each meal inside the package should track interaction state.

Example:

```json
{
  "packageItemId": "pkg_item_001",
  "mealId": "meal_001",
  "position": 1,
  "status": "approved",
  "source": "saved",
  "wasUserSelected": false,
  "wasGenerated": true
}
```

For swapped meals:

```json
{
  "packageItemId": "pkg_item_002",
  "mealId": "meal_009",
  "position": 2,
  "status": "swapped",
  "source": "saved",
  "wasUserSelected": true,
  "wasGenerated": false,
  "replacedMealId": "meal_004"
}
```

---

## 12. State Management

The UI should maintain current planning state across the workflow.

Important state values:

```json
{
  "currentStep": "meals",
  "requestedMealCount": 4,
  "currentMealPackage": {},
  "selectedMeals": [],
  "weeklyStaplesSelections": [],
  "restockSelections": [],
  "draftGroceryList": []
}
```

Recommended step states:

```text
meals
weekly_staples
restock_items
final_review
complete
```

The user should be able to move forward through the flow.

Back navigation should be supported if feasible, but changes may require recalculating the grocery list.

---

## 13. Navigation Requirements

### 13.1 Tabs

The app may display tabs:

```text
Meals | Weekly Staples | Restock Items | Final List
```

Recommended behavior:

- Meals tab is active first.
- Later tabs are locked, disabled, or visually incomplete until the prior steps have enough data.
- User can return to earlier tabs to make changes.
- If meals are changed after list generation, the final list should update or prompt the user to regenerate.

### 13.2 Forward Navigation

Primary flow:

```text
Meals → Weekly Staples → Restock Items → Final List
```

The main CTA on each step should move the user forward:

- Meals: **Use These Meals**
- Weekly Staples: **Continue to Restock Items**
- Restock Items: **Generate Final List**
- Final List: **Save List**, **Export**, or **Start Shopping**

### 13.3 Back Navigation

If the user goes back and changes meals after already creating the grocery list, the app needs to handle ingredient changes.

Possible options:

#### Option A — Auto-update list

When meals change, the list updates automatically.

Pros:

- Smooth UX

Cons:

- Can unexpectedly remove items the user manually added later

#### Option B — Prompt user

Show:

```text
Changing meals may update your grocery list.

[Update list] [Keep current list] [Cancel]
```

Recommended approach:

Use **Option B** once final-list editing exists.

---

## 14. Grocery List Generation from Meals

When the user submits selected meals, the app should generate grocery list ingredients.

### 14.1 Ingredient Aggregation

If multiple meals use the same ingredient, the app should combine them when possible.

Example:

Meal 1 needs:

```text
1 lb ground beef
```

Meal 2 needs:

```text
1 lb ground beef
```

Final list should show:

```text
2 lb ground beef
```

### 14.2 Unit Handling

The app should only combine ingredients when the units are compatible.

Easy combinations:

- lb + lb
- oz + oz
- cups + cups
- cans + cans
- packages + packages

Harder combinations:

- 1 onion + 0.5 cup diced onion
- 1 package cheese + 8 oz shredded cheese
- 1 jar sauce + 2 cups sauce

Phase 1 can use simple matching and avoid complex conversions.

---

## 15. Errors and Edge Cases

### 15.1 User requests more meals than database can support

If the user requests 10 meals but only has 5 saved meals, the app should:

- Show available meals
- Avoid crashing
- Optionally include new recipe suggestions
- Inform the user

Example message:

```text
You only have 5 saved meals available. We added those and can suggest new recipes for the rest.
```

### 15.2 User removes all meals

If all meals are removed, show an empty state:

```text
No meals selected.

[Generate suggestions] [Search my meals]
```

The user should not be able to continue until at least one meal is selected.

### 15.3 Search returns no meals

Show:

```text
No matching meals found.
```

Possible actions:

```text
[Clear search] [Browse all meals]
```

Future action:

```text
[Create new meal]
```

### 15.4 Duplicate meal selected

If the user tries to swap in a meal already in the current package, the app should either:

- Allow duplicates, or
- Warn the user

Recommended default:

Warn but allow.

Example:

```text
This meal is already in your plan. Add it again?
```

### 15.5 Meal has missing ingredients

If a meal does not have ingredients attached, the app should still allow the meal but warn the user:

```text
This meal does not have ingredients yet, so it will not add anything to your grocery list.
```

---

## 16. Acceptance Criteria

### Meal Count Entry

- User can enter the number of meals they want for the week.
- Invalid meal counts are rejected.
- A valid count triggers meal package generation.

### Meal Package Generation

- App generates a package with the requested number of meals when enough meals are available.
- App handles cases where fewer meals are available.
- Generated meals are displayed as individual cards.

### Meal Card Actions

For each meal:

- User can approve the meal.
- User can remove the meal.
- User can request a new suggestion.
- User can swap with a saved meal.
- Swap opens a search interface.
- Search returns meals from the user’s saved meal database.
- Selecting a search result replaces the current meal.

### Submit Flow

- User can submit the meal package with at least one meal selected.
- Selected meals are saved to the weekly plan.
- App proceeds to Weekly Staples.
- Removed meals are not included in grocery list generation.

### Grocery List Prep

- Ingredients from selected meals are added to the draft grocery list.
- Duplicate ingredients are combined when possible.
- Ingredients are grouped by category where available.

---

## 17. Phase 1 Recommended Scope

### Include in Phase 1

- Meals tab
- Meal count input
- Generate one suggested meal package
- Meal cards
- Approve meal
- Remove meal
- Give me new suggestion
- Swap with my meal
- Search saved meals by name
- Submit selected meals
- Move to Weekly Staples
- Generate draft grocery list from selected meal ingredients

### Defer Until Later

- Multiple package options
- Advanced meal recommendation logic
- Weather-based meal suggestions
- Cost optimization
- Nutrition balancing
- New internet recipe discovery
- Advanced ingredient unit conversion
- Complex meal history analysis
- “Remember I disliked this suggestion” logic
- Creating a new meal directly from the swap search
- AI-generated recipe import

---

## 18. Open Questions

These do not need to block initial implementation, but should be decided later.

1. Should the app show one meal package at a time or multiple package options?
2. Should meals be treated as selected by default, or only after approval?
3. Should approving a meal have any data-learning effect?
4. Should removing a meal affect future recommendations?
5. Should “Give me new suggestion” pull only from saved meals at first?
6. Should new recipes be included in Phase 1?
7. Should the user be able to manually add a meal not in the database?
8. Should meal package suggestions consider Aldi pricing?
9. Should weather influence the initial meal package?
10. Should the final list auto-update if the user changes meals after editing the grocery list?

---

## 19. Suggested Developer Implementation Order

### Step 1 — Data foundation

Create or confirm data structures for:

- Meal
- Ingredient
- WeeklyPlan
- MealPackage
- GroceryListItem

### Step 2 — Meals tab shell

Build the Meals tab with:

- Meal count input
- Generate button
- Empty state

### Step 3 — Meal package generation

Implement simple package generation from saved meals.

Initial logic:

```text
Select N meals from saved meal database.
Avoid duplicates within the package.
```

### Step 4 — Meal cards

Render each meal as a card with actions:

```text
Approve
Remove
Give me new suggestion
Swap with my meal
```

### Step 5 — Swap search

Implement search over saved meal names.

Selecting a result replaces the current card.

### Step 6 — Submit selected meals

Save selected meals into the weekly plan.

### Step 7 — Ingredient extraction

Pull ingredients from selected meals into a draft grocery list.

### Step 8 — Move to Weekly Staples

Route user to the next tab/step.

---

## 20. Summary

The Meals-first flow should be the starting point for weekly planning.

The user enters how many meals they want, receives a suggested package, edits individual meal suggestions, and submits the selected meals when ready. The app then uses those meals to begin building the grocery list before moving into weekly staples, restock suggestions, and final list review.

The first version should focus on a simple, flexible flow rather than advanced recommendation intelligence. The key is giving the user fast control over the meal plan before the grocery list is generated.
