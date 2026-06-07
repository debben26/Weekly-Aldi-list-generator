import RecipeForm from "@/components/RecipeForm";
import { createRecipe } from "../actions";

export default function NewRecipePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New recipe</h1>
      <p className="text-sm text-gray-500">Save the recipe, then add its ingredients.</p>
      <RecipeForm action={createRecipe} submitLabel="Create recipe" />
    </div>
  );
}
