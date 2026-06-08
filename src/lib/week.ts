// Resolve the Monday-of-week for a given day, at UTC midnight so it lands cleanly in a
// Prisma `@db.Date` column (MealPlan.weekStartDate / ShoppingList.weekStart).
export function currentWeekStart(today: Date = new Date()): Date {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // getUTCDay: 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}
