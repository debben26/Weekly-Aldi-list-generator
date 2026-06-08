import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { currentWeekStart } from "@/lib/week";

export const dynamic = "force-dynamic";

// Entry to the weekly planning wizard: resolve (or create) this week's draft meal plan, then
// hand off to the Meals step. Returning here re-finds the same draft, so the flow resumes.
export default async function PlanEntry() {
  const household = await getDefaultHousehold();
  const weekStartDate = currentWeekStart();

  let plan = await prisma.mealPlan.findFirst({
    where: { householdId: household.id, weekStartDate, status: "draft" },
  });
  if (!plan) {
    plan = await prisma.mealPlan.create({
      data: { householdId: household.id, weekStartDate, status: "draft" },
    });
  }

  redirect(`/plan/${plan.id}/meals`);
}
