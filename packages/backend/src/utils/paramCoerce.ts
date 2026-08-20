/** Express route params can be a string or string[] when a query key repeats; take the first value. */
export function paramToString(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}
