import { useState, useCallback } from 'react'
import type { Guild } from '@/types'
import { api } from '@/services/api'
import { toast } from 'sonner'
import Button from '@/components/ui/Button'

interface AddBotButtonProps {
    guild: Guild
}

export default function AddBotButton({ guild }: AddBotButtonProps) {
    const [isLoading, setIsLoading] = useState(false)

    const handleAddBot = useCallback(async () => {
        setIsLoading(true)
        try {
            const response = await api.guilds.getInvite(guild.id)
            window.open(response.data.inviteUrl, '_blank')
            toast.success('Invite URL opened in new tab')
        } catch {
            toast.error('Failed to generate invite URL')
        } finally {
            setIsLoading(false)
        }
    }, [guild.id])

    return (
        <Button
            onClick={handleAddBot}
            disabled={isLoading}
            variant='secondary'
            className='flex-1'
            aria-label={`Add bot to ${guild.name}`}
        >
            {isLoading ? 'Loading...' : 'Add Bot'}
        </Button>
    )
}
