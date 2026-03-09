import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'

export default function ServerSelector() {
    const { guilds, selectedGuild, setSelectedGuild } = useGuildStore()

    return (
        <div className='space-y-2'>
            <label className='text-sm font-medium text-lucky-text-secondary'>
                Select Server
            </label>
            <select
                value={selectedGuild?.id || ''}
                onChange={(e) => setSelectedGuild(e.target.value || null)}
                className={cn(
                    'w-full px-3 py-2 bg-lucky-bg-secondary border border-lucky-border rounded-lg',
                    'text-white text-sm',
                    'focus:outline-hidden focus:ring-2 focus:ring-lucky-red focus:border-transparent',
                )}
            >
                <option value=''>Select a server...</option>
                {guilds.map((guild) => (
                    <option key={guild.id} value={guild.id}>
                        {guild.name} {guild.botAdded ? '✓' : ''}
                    </option>
                ))}
            </select>
            {selectedGuild && (
                <p className='text-xs text-lucky-text-tertiary'>
                    {selectedGuild.botAdded ? 'Bot added' : 'Bot not added'}
                </p>
            )}
        </div>
    )
}
