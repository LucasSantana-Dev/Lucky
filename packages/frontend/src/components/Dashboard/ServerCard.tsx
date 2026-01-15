import { useNavigate } from 'react-router-dom'
import type { Guild } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import Button from '@/components/ui/Button'
import AddBotButton from './AddBotButton'

interface ServerCardProps {
    guild: Guild
}

export default function ServerCard({ guild }: ServerCardProps) {
    const navigate = useNavigate()

    return (
        <div className='bg-lukbot-bg-secondary border border-lukbot-border rounded-lg p-6 space-y-4 hover:border-lukbot-text-tertiary transition-colors'>
            <div className='flex items-center gap-4'>
                {guild.icon ? (
                    <img
                        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                        alt={guild.name}
                        className='w-16 h-16 rounded-full'
                    />
                ) : (
                    <div className='w-16 h-16 rounded-full bg-lukbot-bg-tertiary flex items-center justify-center text-2xl text-white'>
                        {guild.name.charAt(0)}
                    </div>
                )}
                <div className='flex-1'>
                    <h3 className='text-lg font-semibold text-white'>
                        {guild.name}
                    </h3>
                    <div className='flex items-center gap-2 mt-1'>
                        <Badge
                            className={cn(
                                'text-xs',
                                guild.botAdded
                                    ? 'bg-lukbot-success/20 text-lukbot-success'
                                    : 'bg-lukbot-error/20 text-lukbot-error',
                            )}
                        >
                            {guild.botAdded ? 'Bot Added' : 'Not Added'}
                        </Badge>
                    </div>
                </div>
            </div>
            <div className='flex gap-2'>
                {guild.botAdded ? (
                    <Button
                        onClick={() => navigate('/dashboard')}
                        className='flex-1 bg-lukbot-red hover:bg-lukbot-red/90 text-white'
                    >
                        Manage
                    </Button>
                ) : (
                    <AddBotButton guild={guild} />
                )}
            </div>
        </div>
    )
}
