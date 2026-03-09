import { useState, useEffect, useCallback } from 'react'
import { Tv, Plus, Trash2, Hash } from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'

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
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)
    const [newLogin, setNewLogin] = useState('')
    const [newUserId, setNewUserId] = useState('')
    const [newChannelId, setNewChannelId] = useState('')

    const loadData = useCallback(async () => {
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

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleAdd = async () => {
        if (!guildId || !newLogin || !newUserId || !newChannelId) return
        try {
            await api.twitch.add(guildId, {
                twitchUserId: newUserId,
                twitchLogin: newLogin,
                discordChannelId: newChannelId,
            })
            setShowAdd(false)
            setNewLogin('')
            setNewUserId('')
            setNewChannelId('')
            loadData()
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
                    className='flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-purple-600/10 text-purple-400 hover:bg-purple-600/20 transition-colors'
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
                    <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                        <input
                            type='text'
                            placeholder='Twitch username'
                            value={newLogin}
                            onChange={(e) => setNewLogin(e.target.value)}
                            className='px-3 py-2 text-sm rounded-lg bg-lucky-bg-active border border-lucky-border text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:border-purple-500'
                        />
                        <input
                            type='text'
                            placeholder='Twitch user ID'
                            value={newUserId}
                            onChange={(e) => setNewUserId(e.target.value)}
                            className='px-3 py-2 text-sm rounded-lg bg-lucky-bg-active border border-lucky-border text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:border-purple-500'
                        />
                        <input
                            type='text'
                            placeholder='Discord channel ID'
                            value={newChannelId}
                            onChange={(e) => setNewChannelId(e.target.value)}
                            className='px-3 py-2 text-sm rounded-lg bg-lucky-bg-active border border-lucky-border text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:border-purple-500'
                        />
                    </div>
                    <div className='flex gap-2'>
                        <button
                            onClick={handleAdd}
                            disabled={!newLogin || !newUserId || !newChannelId}
                            className='px-4 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            Save
                        </button>
                        <button
                            onClick={() => setShowAdd(false)}
                            className='px-4 py-1.5 text-sm rounded-lg bg-lucky-bg-active text-lucky-text-secondary hover:text-white transition-colors'
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className='space-y-2'>
                    {[...Array(3)].map((_, i) => (
                        <div
                            key={i}
                            className='h-14 rounded-lg bg-lucky-bg-tertiary animate-pulse'
                        />
                    ))}
                </div>
            ) : notifications.length === 0 ? (
                <div className='text-center py-12 text-lucky-text-tertiary'>
                    No Twitch notifications configured
                </div>
            ) : (
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
                                    {notif.discordChannelId}
                                </p>
                            </div>
                            <button
                                onClick={() => handleRemove(notif.twitchUserId)}
                                className='p-1.5 rounded-md text-lucky-text-tertiary hover:text-lucky-error hover:bg-lucky-error/10 transition-colors opacity-0 group-hover:opacity-100'
                                aria-label={`Remove ${notif.twitchLogin}`}
                            >
                                <Trash2 className='w-4 h-4' />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
