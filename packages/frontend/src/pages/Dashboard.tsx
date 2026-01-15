import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import Button from '@/components/ui/Button'
import ServerGrid from '@/components/Dashboard/ServerGrid'
import { useGuildStore } from '@/stores/guildStore'

export default function DashboardPage() {
    const navigate = useNavigate()
    const { selectedGuild, guilds, selectGuild, fetchGuilds } = useGuildStore()

    useEffect(() => {
        fetchGuilds()
    }, [fetchGuilds])

    useEffect(() => {
        if (!selectedGuild && guilds.length > 0) {
            const firstWithBot = guilds.find((g) => g.botAdded)
            if (firstWithBot) {
                selectGuild(firstWithBot)
            }
        }
    }, [guilds, selectedGuild, selectGuild])

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <div className='w-24 h-24 bg-lukbot-bg-tertiary rounded-2xl flex items-center justify-center mb-4'>
                    <FolderKanban className='w-12 h-12 text-lukbot-text-tertiary' />
                </div>
                <h2 className='text-xl font-semibold text-white mb-2'>
                    No Server Selected
                </h2>
                <p className='text-lukbot-text-secondary mb-4'>
                    Select a server from the dropdown above to manage it
                </p>
                <Button
                    onClick={() => navigate('/servers')}
                    className='bg-lukbot-red hover:bg-lukbot-red/90'
                >
                    View Your Servers
                </Button>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div>
                <h1 className='text-2xl font-bold text-white mb-4'>
                    Dashboard
                </h1>
                <ServerGrid />
            </div>
        </div>
    )
}
