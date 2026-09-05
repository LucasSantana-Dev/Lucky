/**
 * True when `url` parses as a URL whose host is one of `hosts` or a subdomain
 * of one. Unlike a raw `.includes(host)` check, this cannot be spoofed by a
 * lookalike host (`evil-youtube.com.attacker.tld`) or a query/path segment
 * that merely mentions the host. Returns false for anything that fails to
 * parse as a URL.
 *
 * Deliberately dependency-free (only the global `URL`): several music
 * modules across different layers (functions/, handlers/, utils/) need this
 * check, and pulling it from a module with its own heavy import graph (e.g.
 * queryUtils.ts) either creates a circular import or drags unrelated
 * dependencies into call sites that don't otherwise need them.
 */
export function isHost(url: string, ...hosts: string[]): boolean {
    try {
        const hostname = new URL(url).hostname.toLowerCase()
        return hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))
    } catch {
        return false
    }
}
