import { useState, useEffect, useCallback } from 'react'
import { Tv, Plus, Trash2, Hash } from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { GuildChannelOption } from '@/types'

interface TwitchNotification {
    id: string
    guildId: string
    twitchUserId: string
    twitchLogin: string
    discordChannelId: string
}

export default function TwitchNotificationsPage() {
    const { selectedGuild } = useGuildSelection()
    const guildId = selectedGuild?.id
    const [notifications, setNotifications] = useState<TwitchNotification[]>([])
    const [channels, setChannels] = useState<GuildChannelOption[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [channelsError, setChannelsError] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)
    const [newTwitchInput, setNewTwitchInput] = useState('')
    const [newChannelId, setNewChannelId] = useState('')

    const loadNotifications = useCallback(async () => {
        if (!guildId) return
        setIsLoading(true)
        setError(null)
        try {
            const res = await api.twitch.list(guildId)
            setNotifications(res.data.notifications)
        } catch {
            setError('Failed to load Twitch notifications')
        } finally {
            setIsLoading(false)
        }
    }, [guildId])

    const loadChannels = useCallback(async () => {
        if (!guildId) return
        setChannelsError(null)
        try {
            const res = await api.guilds.getChannels(guildId)
            setChannels(res.data.channels)
        } catch {
            setChannels([])
            setChannelsError('Failed to load Discord channels')
        }
    }, [guildId])

    useEffect(() => {
        loadNotifications().catch(() => {})
        loadChannels().catch(() => {})
    }, [loadNotifications, loadChannels])

    const parseTwitchLogin = (value: string): string | null => {
        const normalized = value.trim()
        if (!normalized) {
            return null
        }

        let login = normalized
        if (normalized.includes('twitch.tv/')) {
            try {
                const url = new URL(
                    normalized.startsWith('http')
                        ? normalized
                        : `https://${normalized}`,
                )
                const firstSegment = url.pathname
                    .split('/')
                    .map((segment) => segment.trim())
                    .find(Boolean)
                login = firstSegment ?? ''
            } catch {
                return null
            }
        }

        if (login.startsWith('@')) {
            login = login.slice(1)
        }

        const lowerLogin = login.toLowerCase()
        if (!/^[a-z0-9_]{3,25}$/.test(lowerLogin)) {
            return null
        }

        return lowerLogin
    }

    const handleAdd = async () => {
        if (!guildId || !newTwitchInput || !newChannelId) return
        const login = parseTwitchLogin(newTwitchInput)
        if (!login) {
            setError('Enter a valid Twitch URL or login')
            return
        }

        try {
            const lookup = await api.twitch.lookupUser(login)
            if (
                notifications.some(
                    (item) => item.twitchUserId === lookup.data.id,
                )
            ) {
                setError('This Twitch channel is already configured')
                return
            }

            await api.twitch.add(guildId, {
                twitchUserId: lookup.data.id,
                twitchLogin: lookup.data.login,
                discordChannelId: newChannelId,
            })
            setShowAdd(false)
            setNewTwitchInput('')
            setNewChannelId('')
            loadNotifications().catch(() => {})
        } catch {
            setError('Failed to add notification')
        }
    }

    const handleRemove = async (twitchUserId: string) => {
        if (!guildId) return
        try {
            await api.twitch.remove(guildId, twitchUserId)
            setNotifications((prev) =>
                prev.filter((n) => n.twitchUserId !== twitchUserId),
            )
        } catch {
            setError('Failed to remove notification')
        }
    }

    const renderNotifications = () => {
        if (isLoading) {
            return (
                <div className='space-y-2'>
                    {[...Array(3)].map((_, i) => (
                        <div
                            key={i}
                            className='h-14 rounded-lg bg-lucky-bg-tertiary animate-pulse'
                        />
                    ))}
                </div>
            )
        }

        if (notifications.length === 0) {
            return (
                <div className='text-center py-12 text-lucky-text-tertiary'>
                    No Twitch notifications configured
                </div>
            )
        }

        return (
            <div className='space-y-1'>
                {notifications.map((notif) => (
                    <div
                        key={notif.id}
                        className='group flex items-center gap-3 rounded-lg bg-lucky-bg-tertiary px-4 py-3 transition-colors hover:bg-lucky-bg-active'
                    >
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded bg-purple-600/20'>
                            <Tv className='h-4 w-4 text-purple-400' />
                        </div>
                        <div className='min-w-0 flex-1'>
                            <p className='text-sm font-medium text-white'>
                                {notif.twitchLogin}
                            </p>
                            <p className='flex items-center gap-1 text-xs text-lucky-text-tertiary'>
                                <Hash className='h-3 w-3' />
                                {channels.find(
                                    (channel) =>
                                        channel.id === notif.discordChannelId,
                                )?.name ?? notif.discordChannelId}
                            </p>
                        </div>
                        <button
                            onClick={() => handleRemove(notif.twitchUserId)}
                            className='cursor-pointer rounded-md p-1.5 text-lucky-text-tertiary opacity-0 transition-colors group-hover:opacity-100 hover:bg-lucky-error/10 hover:text-lucky-error'
                            aria-label={`Remove ${notif.twitchLogin}`}
                        >
                            <Trash2 className='h-4 w-4' />
                        </button>
                    </div>
                ))}
            </div>
        )
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-64 text-lucky-text-secondary'>
                <Tv className='h-12 w-12 mb-4 opacity-50' />
                <p className='text-lg'>
                    Select a server to manage Twitch notifications
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6 px-1 sm:px-0'>
            <header className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                    <Tv className='h-6 w-6 text-purple-500' />
                    <h1 className='text-xl font-bold text-white'>
                        Twitch Notifications
                    </h1>
                    <span className='text-sm text-lucky-text-tertiary'>
                        ({notifications.length})
                    </span>
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className='flex cursor-pointer items-center gap-2 rounded-lg bg-purple-600/10 px-3 py-1.5 text-sm text-purple-400 transition-colors hover:bg-purple-600/20'
                >
                    <Plus className='w-4 h-4' />
                    Add
                </button>
            </header>

            {error && (
                <div className='p-3 rounded-lg bg-lucky-error/10 text-lucky-error text-sm'>
                    {error}
                </div>
            )}

            {showAdd && (
                <div className='p-4 rounded-lg bg-lucky-bg-tertiary border border-lucky-border space-y-3'>
                    <h3 className='text-sm font-semibold text-white'>
                        Add Twitch Notification
                    </h3>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                        <input
                            type='text'
                            placeholder='Twitch URL or login (e.g. https://twitch.tv/luk)'
                            value={newTwitchInput}
                            onChange={(e) => setNewTwitchInput(e.target.value)}
                            className='px-3 py-2 text-sm rounded-lg bg-lucky-bg-active border border-lucky-border text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:border-purple-500'
                        />
                        <Select
                            value={newChannelId}
                            onValueChange={(value) => setNewChannelId(value)}
                        >
                            <SelectTrigger className='bg-lucky-bg-active border-lucky-border text-white'>
                                <SelectValue placeholder='Select Discord channel' />
                            </SelectTrigger>
                            <SelectContent className='bg-lucky-bg-secondary border-lucky-border text-white'>
                                {channels.map((channel) => (
                                    <SelectItem
                                        key={channel.id}
                                        value={channel.id}
                                    >
                                        {channel.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {channelsError && (
                        <p className='text-xs text-lucky-error'>
                            {channelsError}
                        </p>
                    )}
                    <div className='flex gap-2'>
                        <button
                            onClick={handleAdd}
                            disabled={
                                !newTwitchInput ||
                                !newChannelId ||
                                channels.length === 0
                            }
                            className='px-4 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
                        >
                            Save
                        </button>
                        <button
                            onClick={() => setShowAdd(false)}
                            className='px-4 py-1.5 text-sm rounded-lg bg-lucky-bg-active text-lucky-text-secondary hover:text-white transition-colors cursor-pointer'
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {renderNotifications()}
        </div>
    )
}
