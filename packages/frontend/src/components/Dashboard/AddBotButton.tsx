import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Guild } from '@/types'
import { api } from '@/services/api'
import { toast } from 'sonner'
import Button from '@/components/ui/Button'

interface AddBotButtonProps {
    guild: Guild
}

export default function AddBotButton({ guild }: AddBotButtonProps) {
    const { t } = useTranslation('servers')
    const [isLoading, setIsLoading] = useState(false)

    const handleAddBot = useCallback(async () => {
        setIsLoading(true)
        try {
            const response = await api.guilds.getInvite(guild.id)
            window.open(response.data.inviteUrl, '_blank')
            toast.success(t('inviteOpened'))
        } catch {
            toast.error(t('inviteFailed'))
        } finally {
            setIsLoading(false)
        }
    }, [guild.id, t])

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
