import { useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, MessageSquare, Shield } from 'lucide-react'
import Button from '@/components/ui/Button'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const MusicConfig = lazy(() => import('@/components/Config/MusicConfig'))
const CommandsConfig = lazy(() => import('@/components/Config/CommandsConfig'))

export default function ConfigPage() {
    usePageMetadata({
        title: 'Configuration - Lucky',
        description: 'Configure modules and commands for your Discord servers',
    })
    const [selectedModule, setSelectedModule] = useState<string | null>(null)
    const { selectedGuild } = useGuildSelection()
    const navigate = useNavigate()

    const modules = [
        {
            id: 'music',
            name: 'Music Module',
            description:
                'Configure music playback, queue management, and audio settings',
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
            description:
                'Set up auto-moderation, filters, and moderation actions',
            icon: Shield,
        },
    ]

    const handleModuleClick = (moduleId: string) => {
        if (moduleId === 'moderation') {
            navigate('/automod')
            return
        }
        setSelectedModule(moduleId)
    }

    if (!selectedGuild) {
        return (
            <main className='space-y-6'>
                <header>
                    <h1 className='type-h1 text-lucky-text-primary mb-2'>
                        Configuration
                    </h1>
                    <p className='text-lucky-text-secondary'>
                        Please select a server to configure
                    </p>
                </header>
            </main>
        )
    }

    return (
        <main className='space-y-6'>
            <header>
                <h1 className='type-h1 text-lucky-text-primary mb-2'>
                    Configuration
                </h1>
                <p className='text-lucky-text-secondary'>
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
                            <button
                                key={module.id}
                                type='button'
                                className='surface-card group w-full p-6 text-left transition-all duration-200 hover:border-lucky-border-strong hover:bg-lucky-bg-active focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-lucky-brand/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                                onClick={() => handleModuleClick(module.id)}
                            >
                                <div className='flex items-start gap-4'>
                                    <div
                                        className='rounded-lg bg-lucky-brand/15 p-3 text-lucky-brand transition-colors group-hover:bg-lucky-brand/20'
                                        aria-hidden='true'
                                    >
                                        <module.icon className='h-6 w-6' />
                                    </div>
                                    <div className='flex-1'>
                                        <h3 className='type-h2 text-lucky-text-primary mb-1'>
                                            {module.name}
                                        </h3>
                                        <p className='text-sm text-lucky-text-secondary'>
                                            {module.description}
                                        </p>
                                    </div>
                                </div>
                            </button>
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
                    <Suspense fallback={<LoadingSpinner />}>
                        {selectedModule === 'music' && (
                            <MusicConfig guildId={selectedGuild.id} />
                        )}
                        {selectedModule === 'commands' && (
                            <CommandsConfig guildId={selectedGuild.id} />
                        )}
                    </Suspense>
                </section>
            )}
        </main>
    )
}
