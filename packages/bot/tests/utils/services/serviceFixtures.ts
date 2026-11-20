/**
 * Typed fixture cast for service specs. Specs build partial Track, GuildQueue,
 * Client or Prisma-shaped objects holding only the fields the code under test
 * reads. The single widening cast lives here; the target type is inferred from
 * the parameter the value is passed to, or given explicitly when assigned.
 * The object is returned as is (no copy), so identity assertions keep working.
 */
export function asFixture<T>(mock: unknown): T {
    return mock as T
}
