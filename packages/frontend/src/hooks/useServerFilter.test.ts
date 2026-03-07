import { describe, test, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useServerFilter } from './useServerFilter'
import type { Guild } from '@/types'

const makeGuild = (id: string, botAdded: boolean): Guild => ({
    id,
    name: `Server ${id}`,
    icon: null,
    owner: false,
    permissions: '0',
    features: [],
    botAdded,
})

const guilds = [
    makeGuild('1', true),
    makeGuild('2', false),
    makeGuild('3', true),
]

describe('useServerFilter', () => {
    test('should return all guilds by default', () => {
        const { result } = renderHook(() => useServerFilter(guilds))
        expect(result.current.filteredGuilds).toHaveLength(3)
        expect(result.current.filter).toBe('all')
    })

    test('should filter guilds with bot', () => {
        const { result } = renderHook(() => useServerFilter(guilds))

        act(() => result.current.setFilter('with-bot'))

        expect(result.current.filteredGuilds).toHaveLength(2)
        expect(result.current.filteredGuilds.every((g) => g.botAdded)).toBe(
            true,
        )
    })

    test('should filter guilds without bot', () => {
        const { result } = renderHook(() => useServerFilter(guilds))

        act(() => result.current.setFilter('without-bot'))

        expect(result.current.filteredGuilds).toHaveLength(1)
        expect(result.current.filteredGuilds[0].id).toBe('2')
    })

    test('should return empty for empty input', () => {
        const { result } = renderHook(() => useServerFilter([]))
        expect(result.current.filteredGuilds).toEqual([])
    })

    test('should reset to all', () => {
        const { result } = renderHook(() => useServerFilter(guilds))

        act(() => result.current.setFilter('with-bot'))
        act(() => result.current.setFilter('all'))

        expect(result.current.filteredGuilds).toHaveLength(3)
    })
})
