import { create } from 'zustand'
import type { Guild } from '../types/guild'
import api from '../services/api'

interface GuildState {
  guilds: Guild[]
  selectedGuildId: string | null
  isLoading: boolean
  fetchGuilds: () => Promise<void>
  setSelectedGuild: (guildId: string | null) => void
  getSelectedGuild: () => Guild | null
}

export const useGuildStore = create<GuildState>((set, get) => ({
  guilds: [],
  selectedGuildId: null,
  isLoading: false,
  fetchGuilds: async () => {
    set({ isLoading: true })
    try {
      const response = await api.get<{ guilds: Guild[] }>('/guilds')
      set({ guilds: response.data.guilds, isLoading: false })
    } catch {
      set({ guilds: [], isLoading: false })
    }
  },
  setSelectedGuild: (guildId: string | null) => {
    set({ selectedGuildId: guildId })
  },
  getSelectedGuild: () => {
    const { guilds, selectedGuildId } = get()
    return guilds.find((g) => g.id === selectedGuildId) ?? null
  },
}))
