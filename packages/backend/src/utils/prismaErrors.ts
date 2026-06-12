/**
 * Narrow check for Prisma's unique-constraint violation (P2002) without
 * importing the generated client error class across package boundaries.
 */
export function isUniqueViolation(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'P2002'
}
