import { useEffect, useState } from 'react'
import { Server, Users, Hash, Mic, Tag } from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'
import { api } from '@/services/api'

interface BotGuild {
    id: string
    name: string
    iconUrl: string | null
    memberCount: number | null
    textChannelCount: number | null
    voiceChannelCount: number | null
    roleCount: number | null
}

function GuildRow({ guild }: { guild: BotGuild }) {
    return (
        <div className='flex items-center gap-3 rounded-lg border border-lucky-border bg-lucky-bg-secondary/60 px-4 py-3'>
            {guild.iconUrl ? (
                <img
                    src={guild.iconUrl}
                    alt={guild.name}
                    className='h-10 w-10 rounded-full shrink-0 object-cover'
                />
            ) : (
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lucky-bg-tertiary'>
                    <Server className='h-5 w-5 text-lucky-text-subtle' />
                </div>
            )}
            <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium text-lucky-text-primary'>
                    {guild.name}
                </p>
                <p className='text-xs text-lucky-text-subtle'>{guild.id}</p>
            </div>
            <div className='hidden sm:flex items-center gap-4 text-xs text-lucky-text-secondary shrink-0'>
                {guild.memberCount !== null && (
                    <span className='flex items-center gap-1'>
                        <Users className='h-3.5 w-3.5' />
                        {guild.memberCount.toLocaleString()}
                    </span>
                )}
                {guild.textChannelCount !== null && (
                    <span className='flex items-center gap-1'>
                        <Hash className='h-3.5 w-3.5' />
                        {guild.textChannelCount}
                    </span>
                )}
                {guild.voiceChannelCount !== null && (
                    <span className='flex items-center gap-1'>
                        <Mic className='h-3.5 w-3.5' />
                        {guild.voiceChannelCount}
                    </span>
                )}
                {guild.roleCount !== null && (
                    <span className='flex items-center gap-1'>
                        <Tag className='h-3.5 w-3.5' />
                        {guild.roleCount}
                    </span>
                )}
            </div>
        </div>
    )
}

export default function BotGuildsSection() {
    const [guilds, setGuilds] = useState<BotGuild[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        api.admin
            .getGuilds()
            .then((res) => {
                const sorted = [...res.data.guilds].sort((a, b) =>
                    a.name.localeCompare(b.name),
                )
                setGuilds(sorted)
            })
            .catch(() => setError('Failed to load server list.'))
            .finally(() => setLoading(false))
    }, [])

    return (
        <section>
            <div className='flex items-center gap-2 mb-4'>
                <Server className='w-5 h-5 text-lucky-purple' aria-hidden='true' />
                <h2 className='text-lg font-semibold text-white'>
                    Bot Servers
                </h2>
                {!loading && (
                    <span className='ml-1 rounded-full bg-lucky-bg-tertiary px-2 py-0.5 text-xs text-lucky-text-secondary'>
                        {guilds.length}
                    </span>
                )}
            </div>

            {loading && (
                <div className='space-y-2'>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className='h-16 w-full' />
                    ))}
                </div>
            )}

            {error && (
                <p className='text-sm text-lucky-red'>{error}</p>
            )}

            {!loading && !error && guilds.length === 0 && (
                <p className='text-sm text-lucky-text-secondary'>
                    No servers found. The bot may not be connected.
                </p>
            )}

            {!loading && !error && guilds.length > 0 && (
                <div className='space-y-2'>
                    {guilds.map((guild) => (
                        <GuildRow key={guild.id} guild={guild} />
                    ))}
                </div>
            )}
        </section>
    )
}
