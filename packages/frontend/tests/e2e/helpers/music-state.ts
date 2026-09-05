import { Page } from '@playwright/test'

// Shared fixtures for specs that render the Music page with a guild
// selected: the localStorage payload for the selected guild, and a mock
// for the music player state endpoint it fetches on mount.
export const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

export function mockMusicState(page: Page) {
    return page.route('**/api/guilds/*/music*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                isPlaying: false,
                currentTrack: null,
                tracks: [],
                volume: 80,
                repeatMode: 'off',
                voiceChannelName: null,
            }),
        })
    })
}
