export const API_ROUTES = {
  AUTH: {
    status: () => '/auth/status',
    user: () => '/auth/user',
    logout: () => '/auth/logout',
    discord: () => '/api/auth/discord',
  },
  GUILDS: {
    list: () => '/guilds',
    detail: (id: string) => `/guilds/${id}`,
    music: {
      state: (id: string) => `/guilds/${id}/music/state`,
      play: (id: string) => `/guilds/${id}/music/play`,
      pause: (id: string) => `/guilds/${id}/music/pause`,
      resume: (id: string) => `/guilds/${id}/music/resume`,
      skip: (id: string) => `/guilds/${id}/music/skip`,
      stop: (id: string) => `/guilds/${id}/music/stop`,
      volume: (id: string) => `/guilds/${id}/music/volume`,
      shuffle: (id: string) => `/guilds/${id}/music/shuffle`,
      repeat: (id: string) => `/guilds/${id}/music/repeat`,
      seek: (id: string) => `/guilds/${id}/music/seek`,
      queue: (id: string) => `/guilds/${id}/music/queue`,
      queueMove: (id: string) => `/guilds/${id}/music/queue/move`,
      queueRemove: (id: string) => `/guilds/${id}/music/queue/remove`,
      queueClear: (id: string) => `/guilds/${id}/music/queue/clear`,
      import: (id: string) => `/guilds/${id}/music/import`,
    },
    autoMessages: {
      list: (id: string) => `/guilds/${id}/automessages`,
      create: (id: string) => `/guilds/${id}/automessages`,
      update: (id: string, msgId: string) => `/guilds/${id}/automessages/${msgId}`,
      toggle: (id: string, msgId: string) => `/guilds/${id}/automessages/${msgId}/toggle`,
      delete: (id: string, msgId: string) => `/guilds/${id}/automessages/${msgId}`,
    },
    automation: {
      status: (id: string) => `/guilds/${id}/automation/status`,
    },
  },
  ARTISTS: {
    search: (query: string) => `/artists/search?q=${encodeURIComponent(query)}`,
    related: (id: string) => `/artists/${id}/related`,
    suggestions: () => '/artists/suggestions',
  },
} as const;
