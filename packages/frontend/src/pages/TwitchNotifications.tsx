import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Tv, Plus, Trash2, Hash } from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
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

const TWITCH_LOADING_SKELETON_KEYS = [
    'tw-loading-1',
    'tw-loading-2',
    'tw-loading-3',
]

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback
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
    const [twitchConfigured, setTwitchConfigured] = useState<boolean | null>(
        null,
    )
    const notificationsRequestIdRef = useRef(0)
    const channelsRequestIdRef = useRef(0)
    const selectedGuildIdRef = useRef<string | undefined>(guildId)

    useEffect(() => {
        selectedGuildIdRef.current = guildId
    }, [guildId])

    useEffect(() => {
        const checkTwitchStatus = async () => {
            try {
                const res = await api.twitch.status()
                setTwitchConfigured(res.data.configured)
            } catch {
                setTwitchConfigured(false)
            }
        }
        checkTwitchStatus()
    }, [])

    const channelNameById = useMemo(
        () => new Map(channels.map((channel) => [channel.id, channel.name])),
        [channels],
    )

    const loadNotifications = useCallback(async (requestGuildId: string) => {
        const requestId = notificationsRequestIdRef.current + 1
        notificationsRequestIdRef.current = requestId
        setIsLoading(true)
        setError(null)
        try {
            const res = await api.twitch.list(requestGuildId)
            if (
                requestId !== notificationsRequestIdRef.current ||
                selectedGuildIdRef.current !== requestGuildId
            ) {
                return
            }
            setNotifications(res.data.notifications)
        } catch {
            if (
                requestId !== notificationsRequestIdRef.current ||
                selectedGuildIdRef.current !== requestGuildId
            ) {
                return
            }
            setError('Failed to load Twitch notifications')
        } finally {
            if (
                requestId === notificationsRequestIdRef.current &&
                selectedGuildIdRef.current === requestGuildId
            ) {
                setIsLoading(false)
            }
        }
    }, [])

    const loadChannels = useCallback(async (requestGuildId: string) => {
        const requestId = channelsRequestIdRef.current + 1
        channelsRequestIdRef.current = requestId
        setChannelsError(null)
        try {
            const res = await api.guilds.getChannels(requestGuildId)
            if (
                requestId !== channelsRequestIdRef.current ||
                selectedGuildIdRef.current !== requestGuildId
            ) {
                return
            }
            setChannels(res.data.channels)
        } catch {
            if (
                requestId !== channelsRequestIdRef.current ||
                selectedGuildIdRef.current !== requestGuildId
            ) {
                return
            }
            setChannels([])
            setChannelsError('Failed to load Discord channels')
        }
    }, [])

    useEffect(() => {
        if (!guildId) {
            notificationsRequestIdRef.current += 1
            channelsRequestIdRef.current += 1
            return
        }

        loadNotifications(guildId).catch(() => {})
        loadChannels(guildId).catch(() => {})
    }, [guildId, loadNotifications, loadChannels])

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
                    .find((segment) => segment.length > 0)
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
        const requestGuildId = guildId
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

            await api.twitch.add(requestGuildId, {
                twitchUserId: lookup.data.id,
                twitchLogin: lookup.data.login,
                discordChannelId: newChannelId,
            })
            setShowAdd(false)
            setNewTwitchInput('')
            setNewChannelId('')
            if (selectedGuildIdRef.current === requestGuildId) {
                await loadNotifications(requestGuildId)
            }
        } catch (error) {
            setError(getErrorMessage(error, 'Failed to add notification'))
        }
    }

    const handleRemove = async (twitchUserId: string) => {
        if (!guildId) return
        try {
            await api.twitch.remove(guildId, twitchUserId)
            setNotifications((prev) =>
                prev.filter((n) => n.twitchUserId !== twitchUserId),
            )
        } catch (error) {
            setError(getErrorMessage(error, 'Failed to remove notification'))
        }
    }

    const renderNotifications = () => {
        if (isLoading) {
            return (
                <div className='space-y-2'>
                    {TWITCH_LOADING_SKELETON_KEYS.map((key) => (
                        <div
                            key={key}
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
                        className='flex items-center gap-3 px-4 py-3 rounded-lg bg-lucky-bg-tertiary hover:bg-lucky-bg-active transition-colors group'
                    >
                        <div className='w-8 h-8 rounded bg-purple-600/20 flex items-center justify-center shrink-0'>
                            <Tv className='w-4 h-4 text-purple-400' />
                        </div>
                        <div className='flex-1 min-w-0'>
                            <p className='text-sm font-medium text-white'>
                                {notif.twitchLogin}
                            </p>
                            <p className='text-xs text-lucky-text-tertiary flex items-center gap-1'>
                                <Hash className='w-3 h-3' />
                                {channelNameById.get(notif.discordChannelId) ??
                                    notif.discordChannelId}
                            </p>
                        </div>
                        <button
                            onClick={() => handleRemove(notif.twitchUserId)}
                            className='lucky-focus-visible p-1.5 rounded-md text-lucky-text-tertiary hover:text-lucky-error hover:bg-lucky-error/10 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 cursor-pointer'
                            aria-label={`Remove ${notif.twitchLogin}`}
                        >
                            <Trash2 className='w-4 h-4' />
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

    if (twitchConfigured === false) {
        return (
            <div className='space-y-6 px-1 sm:px-0'>
                <header className='flex items-center gap-3'>
                    <Tv className='h-6 w-6 text-purple-500' />
                    <h1 className='text-xl font-bold text-white'>
                        Twitch Notifications
                    </h1>
                </header>
                <div className='p-4 rounded-lg bg-lucky-error/10 border border-lucky-error text-lucky-error'>
                    <p className='font-semibold mb-1'>Not Configured</p>
                    <p className='text-sm'>
                        Twitch API is not configured on this server. Contact the
                        server administrator to set up Twitch credentials.
                    </p>
                </div>
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
                    disabled={!twitchConfigured}
                    className='flex cursor-pointer items-center gap-2 rounded-lg bg-purple-600/10 px-3 py-1.5 text-sm text-purple-400 transition-colors hover:bg-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed'
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
                        <label htmlFor='twitch-login-input' className='sr-only'>
                            Twitch URL or login
                        </label>
                        <input
                            id='twitch-login-input'
                            type='text'
                            aria-label='Twitch URL or login'
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
