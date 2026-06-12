import { z } from 'zod'
import { guildIdParam } from './common'

const searchQuery = z.object({
    q: z.string().min(1, 'Search query is required').max(200),
})

const preferredArtistsQuery = guildIdParam

const savePreferenceBody = z.object({
    guildId: z.string().min(1, 'Guild ID is required'),
    artistKey: z.string().min(1, 'Artist key is required').max(200),
    artistName: z.string().min(1, 'Artist name is required').max(200),
    spotifyId: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    preference: z.enum(['prefer', 'block']).default('prefer'),
})

const batchSavePreferencesBody = z.object({
    guildId: z.string().min(1, 'Guild ID is required'),
    items: z.array(
        z.object({
            artistId: z.string().min(1, 'Artist ID is required'),
            artistKey: z.string().min(1, 'Artist key is required').max(200),
            artistName: z.string().min(1, 'Artist name is required').max(200),
            imageUrl: z.string().nullable().optional(),
            preference: z.enum(['prefer', 'block']),
        }),
        { message: 'Items must be an array' },
    ),
})

const deletePreferenceQuery = guildIdParam

export const artistsSchemas = {
    searchQuery,
    preferredArtistsQuery,
    savePreferenceBody,
    batchSavePreferencesBody,
    deletePreferenceQuery,
}
