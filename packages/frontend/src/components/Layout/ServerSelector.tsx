import { useGuildStore } from '../../stores/guildStore'
import { cn } from '../../lib/utils'

function ServerSelector() {
  const { guilds, selectedGuildId, setSelectedGuild, getSelectedGuild } = useGuildStore()
  const selectedGuild = getSelectedGuild()

  if (guilds.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
      <label className="text-text-secondary text-sm hidden sm:inline">Server:</label>
      <select
        value={selectedGuildId ?? ''}
        onChange={(e) => setSelectedGuild(e.target.value || null)}
        className={cn(
          'px-3 md:px-4 py-2 bg-bg-tertiary border border-bg-border rounded-lg',
          'text-text-primary focus:outline-none focus:ring-2 focus:ring-primary',
          'text-sm md:text-base min-w-[200px]',
        )}
      >
        <option value="">Select a server</option>
        {guilds.map((guild) => (
          <option key={guild.id} value={guild.id}>
            {guild.name} {guild.hasBot ? '✓' : ''}
          </option>
        ))}
      </select>
      {selectedGuild && (
        <span className="text-text-secondary text-xs sm:text-sm">
          {selectedGuild.hasBot ? 'Bot added' : 'Bot not added'}
        </span>
      )}
    </div>
  )
}

export default ServerSelector
