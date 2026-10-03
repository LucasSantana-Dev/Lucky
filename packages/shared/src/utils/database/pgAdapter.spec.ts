import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'

const mockPrismaPg = jest.fn()

jest.mock('@prisma/adapter-pg', () => ({
    PrismaPg: function (this: unknown, opts: unknown) {
        mockPrismaPg(opts)
    },
}))

import { createPgAdapter, resolvePoolMax } from './pgAdapter'

describe('pgAdapter pool size', () => {
    const env = { ...process.env }
    afterEach(() => {
        process.env = { ...env }
    })

    it.each([
        [undefined, 10],
        ['', 10],
        ['abc', 10],
        ['0', 10],
        ['-3', 10],
        ['2.5', 10],
        ['25', 25],
    ])('resolvePoolMax(%p) -> %p', (raw, expected) => {
        expect(resolvePoolMax(raw as string | undefined)).toBe(expected)
    })

    it('passes max to PrismaPg', () => {
        process.env.DATABASE_POOL_MAX = '7'
        createPgAdapter('postgresql://u:p@localhost:5432/x')
        expect(mockPrismaPg).toHaveBeenCalledWith({
            connectionString: 'postgresql://u:p@localhost:5432/x',
            max: 7,
        })
    })

    it('defaults max to 10 when env unset', () => {
        delete process.env.DATABASE_POOL_MAX
        createPgAdapter('postgresql://u:p@localhost:5432/x')
        expect(mockPrismaPg).toHaveBeenLastCalledWith(
            expect.objectContaining({ max: 10 }),
        )
    })
})
