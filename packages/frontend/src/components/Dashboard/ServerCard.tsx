import { useNavigate } from 'react-router-dom'
import type { Guild } from '../../types/guild'
import { cn } from '../../lib/utils'
import AddBotButton from './AddBotButton'

interface ServerCardProps {
  guild: Guild
}

function ServerCard({ guild }: ServerCardProps) {
  const navigate = useNavigate()

  return (
    <div className="bg-bg-secondary border border-bg-border rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-4">
        {guild.icon ? (
          <img
            src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
            alt={guild.name}
            className="w-16 h-16 rounded-full"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center text-2xl">
            {guild.name.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text-primary">{guild.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                'px-2 py-1 rounded text-xs',
                guild.hasBot
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400',
              )}
            >
              {guild.hasBot ? 'Bot Added' : 'Not Added'}
            </span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        {guild.hasBot ? (
          <button
            onClick={() => navigate('/features')}
            className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-text-primary rounded-lg transition-colors"
          >
            Manage
          </button>
        ) : (
          <AddBotButton guild={guild} />
        )}
      </div>
    </div>
  )
}

export default ServerCard
