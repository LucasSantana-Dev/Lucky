import { useState } from 'react'
import { Music, MessageSquare, Shield } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import MusicConfig from '@/components/Config/MusicConfig'
import CommandsConfig from '@/components/Config/CommandsConfig'
import ModerationConfig from '@/components/Config/ModerationConfig'

export default function ConfigPage() {
    usePageMetadata({
        title: 'Configuration - LukBot',
        description: 'Configure modules and commands for your Discord servers',
    })
    const [selectedModule, setSelectedModule] = useState<string | null>(null)
    const { selectedGuild } = useGuildSelection()

    const modules = [
        {
            id: 'music',
            name: 'Music Module',
            description: 'Configure music playback, queue management, and audio settings',
            icon: Music,
        },
        {
            id: 'commands',
            name: 'Commands',
            description: 'Manage command permissions, aliases, and behavior',
            icon: MessageSquare,
        },
        {
            id: 'moderation',
            name: 'Moderation',
            description: 'Set up auto-moderation, filters, and moderation actions',
            icon: Shield,
        },
    ]

    if (!selectedGuild) {
        return (
            <main className='space-y-6'>
                <header>
                    <h1 className='text-2xl font-bold text-white mb-2'>Configuration</h1>
                    <p className='text-text-secondary'>
                        Please select a server to configure
                    </p>
                </header>
            </main>
        )
    }

    return (
        <main className='space-y-6'>
            <header>
                <h1 className='text-2xl font-bold text-white mb-2'>Configuration</h1>
                <p className='text-text-secondary'>
                    Configure modules and commands for your servers
                </p>
            </header>

            {!selectedModule ? (
                <section aria-labelledby='modules-heading'>
                    <h2 id='modules-heading' className='sr-only'>
                        Available Modules
                    </h2>
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                        {modules.map((module) => (
                            <Card
                                key={module.id}
                                className='p-6 hover:bg-bg-tertiary transition-colors cursor-pointer'
                                onClick={() => setSelectedModule(module.id)}
                                role='button'
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        setSelectedModule(module.id)
                                    }
                                }}
                                aria-label={`Configure ${module.name}`}
                            >
                                <div className='flex items-start gap-4'>
                                    <div className='p-3 bg-primary/20 rounded-lg' aria-hidden='true'>
                                        <module.icon className='w-6 h-6 text-primary' />
                                    </div>
                                    <div className='flex-1'>
                                        <h3 className='text-lg font-semibold text-white mb-1'>
                                            {module.name}
                                        </h3>
                                        <p className='text-sm text-text-secondary'>
                                            {module.description}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </section>
            ) : (
                <section aria-labelledby='module-config-heading'>
                    <div className='mb-4'>
                        <Button
                            variant='ghost'
                            onClick={() => setSelectedModule(null)}
                            aria-label='Back to module selection'
                        >
                            ← Back
                        </Button>
                    </div>
                    {selectedModule === 'music' && (
                        <MusicConfig guildId={selectedGuild.id} />
                    )}
                    {selectedModule === 'commands' && (
                        <CommandsConfig guildId={selectedGuild.id} />
                    )}
                    {selectedModule === 'moderation' && (
                        <ModerationConfig guildId={selectedGuild.id} />
                    )}
                </section>
            )}
        </main>
    )
}
