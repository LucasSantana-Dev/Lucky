import { useState } from 'react'
import type { Guild } from '@/types'
import { api } from '@/services/api'
import { toast } from 'sonner'
import Button from '@/components/ui/Button'

interface AddBotButtonProps {
    guild: Guild
}

export default function AddBotButton({ guild }: AddBotButtonProps) {
    const [isLoading, setIsLoading] = useState(false)

    const handleAddBot = async () => {
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
    }

    return (
        <Button
            onClick={handleAddBot}
            disabled={isLoading}
            variant='secondary'
            className='flex-1'
        >
            {isLoading ? 'Loading...' : 'Add Bot'}
        </Button>
    )
}
