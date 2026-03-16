export const MUSIC_BUTTON_IDS = {
    PREVIOUS: 'music_previous',
    PAUSE_RESUME: 'music_pause_resume',
    SKIP: 'music_skip',
    SHUFFLE: 'music_shuffle',
    LOOP: 'music_loop',
} as const

export const QUEUE_BUTTON_PREFIX = 'queue_page'

export type MusicButtonId =
    (typeof MUSIC_BUTTON_IDS)[keyof typeof MUSIC_BUTTON_IDS]
