// Shared Prisma error helpers.

// P2002 = unique constraint violation.
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
