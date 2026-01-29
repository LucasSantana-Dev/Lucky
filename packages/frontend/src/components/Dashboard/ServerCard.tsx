import { memo, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { Guild } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import Button from '@/components/ui/Button'
import AddBotButton from './AddBotButton'

interface ServerCardProps {
    guild: Guild
}

const ServerIcon = memo(
    ({
        name,
        icon,
        guildId,
    }: {
        name: string
        icon: string | null
        guildId: string
    }) => {
        const [imageError, setImageError] = useState(false)
        const initial = name.charAt(0).toUpperCase()

        if (!icon || imageError) {
            return (
                <div
                    className='w-16 h-16 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-2xl font-bold text-white ring-2 ring-bg-border transition-all duration-300'
                    aria-hidden='true'
                >
                    {initial}
                </div>
            )
        }

        return (
            <img
                src={`https://cdn.discordapp.com/icons/${guildId}/${icon}.png`}
                alt={`${name} server icon`}
                className='w-16 h-16 rounded-full object-cover ring-2 ring-bg-border transition-all duration-300'
                onError={() => setImageError(true)}
                loading='lazy'
            />
        )
    },
)

ServerIcon.displayName = 'ServerIcon'

function ServerCard({ guild }: ServerCardProps) {
    const navigate = useNavigate()

    const handleManage = useCallback(() => {
        navigate('/dashboard')
    }, [navigate])

    return (
        <article
            className={cn(
                'group bg-lukbot-bg-secondary border border-lukbot-border rounded-lg p-6 space-y-4',
                'transition-all duration-300 ease-out',
                'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10',
                'hover:-translate-y-1',
                'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background',
            )}
            role='article'
            aria-labelledby={`server-${guild.id}-name`}
        >
            <div className='flex items-center gap-4'>
                <div className='relative flex-shrink-0'>
                    <ServerIcon
                        name={guild.name}
                        icon={guild.icon}
                        guildId={guild.id}
                    />
                    {guild.botAdded && (
                        <div
                            className='absolute -bottom-1 -right-1 w-5 h-5 bg-lukbot-success rounded-full border-2 border-lukbot-bg-secondary flex items-center justify-center'
                            aria-label='Bot is online'
                        >
                            <CheckCircle2 className='w-3 h-3 text-white' />
                        </div>
                    )}
                </div>
                <div className='flex-1 min-w-0'>
                    <h3
                        id={`server-${guild.id}-name`}
                        className='text-lg font-semibold text-white truncate'
                    >
                        {guild.name}
                    </h3>
                    <div className='flex items-center gap-2 mt-1'>
                        <Badge
                            className={cn(
                                'text-xs transition-colors duration-200',
                                guild.botAdded
                                    ? 'bg-lukbot-success/20 text-lukbot-success border-lukbot-success/30'
                                    : 'bg-lukbot-error/20 text-lukbot-error border-lukbot-error/30',
                            )}
                            aria-label={guild.botAdded ? 'Bot is added' : 'Bot is not added'}
                        >
                            {guild.botAdded ? (
                                <>
                                    <CheckCircle2 className='w-3 h-3 mr-1 inline' />
                                    Bot Added
                                </>
                            ) : (
                                <>
                                    <XCircle className='w-3 h-3 mr-1 inline' />
                                    Not Added
                                </>
                            )}
                        </Badge>
                    </div>
                </div>
            </div>
            <div className='flex gap-2'>
                {guild.botAdded ? (
                    <Button
                        onClick={handleManage}
                        className='flex-1 bg-lukbot-red hover:bg-lukbot-red/90 text-white shadow-sm hover:shadow-md transition-all duration-200'
                        aria-label={`Manage ${guild.name}`}
                    >
                        Manage
                    </Button>
                ) : (
                    <AddBotButton guild={guild} />
                )}
            </div>
        </article>
    )
}

export default memo(ServerCard)
