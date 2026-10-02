// Dynamic import keeps the changelog text out of the page chunk: Vite emits it
// as its own chunk, fetched only when /changelog is opened.
export async function loadChangelogSource(): Promise<string> {
    const mod = await import('../../../../CHANGELOG.md?raw')
    return mod.default
}
