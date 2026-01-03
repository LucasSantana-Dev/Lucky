import { fileURLToPath } from 'url'
import { dirname } from 'path'

export function getDirname(importMetaUrl: string): string {
    return dirname(fileURLToPath(importMetaUrl))
}

export function getFilename(importMetaUrl: string): string {
    return fileURLToPath(importMetaUrl)
}

/**
 * Normalizes a path by removing the leading slash on Windows systems
 * @param p The path to normalize
 * @returns The normalized path
 */
export function normalizePath(p: string): string {
    if (process.platform === 'win32' && p.startsWith('/')) {
        return p.slice(1)
    }
    return p
}
