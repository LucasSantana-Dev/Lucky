import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')

function token(name: string): string {
    const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
    if (!match) throw new Error(`token ${name} not found`)
    return match[1]
}

function luminance(hex: string): number {
    const channels = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}

describe('focus indicator contrast (WCAG 1.4.11, 3:1)', () => {
    test.each([
        'lucky-bg-active',
        'lucky-surface-canvas',
        'lucky-surface-sidebar',
        'lucky-surface-panel',
        'lucky-surface-elevated',
    ])('focus token clears 3:1 on %s', (surface) => {
        expect(
            contrast(token('lucky-focus'), token(surface)),
        ).toBeGreaterThanOrEqual(3)
    })
})
