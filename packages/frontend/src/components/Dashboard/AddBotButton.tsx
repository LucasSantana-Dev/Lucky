import { useState } from 'react'
import type { Guild } from '../../types/guild'
import api from '../../services/api'
import { useToast } from '../ui/Toast'
import Button from '../ui/Button'

interface AddBotButtonProps {
  guild: Guild
}

function AddBotButton({ guild }: AddBotButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { showToast } = useToast()

  const handleAddBot = async () => {
    if (!guild.botInviteUrl) return

    setIsLoading(true)
    try {
      const response = await api.get<{ inviteUrl: string }>(`/guilds/${guild.id}/invite`)
      window.open(response.data.inviteUrl, '_blank')
      showToast('Invite URL opened in new tab', 'success')
    } catch {
      showToast('Failed to generate invite URL', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      onClick={handleAddBot}
      disabled={isLoading}
      variant="secondary"
      className="flex-1"
    >
      {isLoading ? 'Loading...' : 'Add Bot'}
    </Button>
  )
}

export default AddBotButton
