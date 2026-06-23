import { useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Music,
    MessageSquare,
    Shield,
    ArrowLeft,
    ChevronRight,
} from 'lucide-react'
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
            <main className='bg-lucky-bg-primary min-h-screen px-4 md:px-6 py-6'>
                <header className='space-y-4'>
                    <div className='space-y-1'>
                        <h1
                            className='text-2xl font-semibold text-lucky-text-primary uppercase tracking-wide'
                            style={{ fontFamily: 'Sora' }}
                        >
                            Configuration
                        </h1>
                        <p
                            className='text-sm text-lucky-text-secondary'
                            style={{ fontFamily: 'Manrope' }}
                        >
                            Please select a server to configure
                        </p>
                    </div>
                </header>
            </main>
        )
    }

    return (
        <main className='bg-lucky-bg-primary min-h-screen'>
            {/* Header */}
            <header className='border-b border-lucky-border bg-lucky-surface-sidebar px-4 md:px-6 py-4'>
                <div className='space-y-1'>
                    <h1
                        className='text-xl font-semibold text-lucky-text-primary uppercase tracking-wide'
                        style={{ fontFamily: 'Sora' }}
                    >
                        Configuration
                    </h1>
                    <p
                        className='text-xs text-lucky-text-tertiary'
                        style={{ fontFamily: 'Manrope' }}
                    >
                        Server:{' '}
                        <span className='text-lucky-text-secondary font-medium'>
                            {selectedGuild.name}
                        </span>
                    </p>
                </div>
            </header>

            {/* Content */}
            <div className='px-4 md:px-6 py-6'>
                {!selectedModule ? (
                    /* Module selection grid — Polaris resource-list density */
                    <section aria-labelledby='modules-heading'>
                        <h2 id='modules-heading' className='sr-only'>
                            Available Configuration Modules
                        </h2>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                            {modules.map((module) => {
                                const Icon = module.icon
                                return (
                                    <button
                                        key={module.id}
                                        type='button'
                                        className='group relative flex items-start gap-4 p-4 rounded-lg border border-lucky-border bg-lucky-surface-panel transition-colors duration-120 hover:border-lucky-border-strong hover:bg-lucky-surface-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-lucky-brand focus-visible:ring-offset-2 focus-visible:ring-offset-lucky-bg-primary'
                                        onClick={() =>
                                            handleModuleClick(module.id)
                                        }
                                        style={{
                                            transitionDuration: '120ms',
                                            transitionTimingFunction:
                                                'cubic-bezier(0.2, 0, 0, 1)',
                                        }}
                                    >
                                        <div
                                            className='flex-shrink-0 p-2 rounded-lg bg-lucky-surface-highlight group-hover:bg-lucky-brand/15 transition-colors duration-120'
                                            style={{
                                                transitionDuration: '120ms',
                                                transitionTimingFunction:
                                                    'cubic-bezier(0.2, 0, 0, 1)',
                                            }}
                                            aria-hidden='true'
                                        >
                                            <Icon className='w-5 h-5 text-lucky-brand' />
                                        </div>
                                        <div className='flex-1 text-left space-y-1'>
                                            <h3
                                                className='text-base font-semibold text-lucky-text-primary'
                                                style={{ fontFamily: 'Sora' }}
                                            >
                                                {module.name}
                                            </h3>
                                            <p
                                                className='text-xs text-lucky-text-secondary leading-snug'
                                                style={{
                                                    fontFamily: 'Manrope',
                                                }}
                                            >
                                                {module.description}
                                            </p>
                                        </div>
                                        <div
                                            className='flex-shrink-0 text-lucky-text-tertiary group-hover:text-lucky-text-secondary transition-colors duration-120'
                                            style={{
                                                transitionDuration: '120ms',
                                                transitionTimingFunction:
                                                    'cubic-bezier(0.2, 0, 0, 1)',
                                            }}
                                        >
                                            <ChevronRight className='w-4 h-4' />
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </section>
                ) : (
                    /* Module config view */
                    <section aria-labelledby='module-config-heading'>
                        <div className='mb-6 flex items-center gap-2'>
                            <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => setSelectedModule(null)}
                                className='gap-2 text-lucky-text-secondary hover:text-lucky-text-primary'
                            >
                                <ArrowLeft className='w-4 h-4' /> Back
                            </Button>
                        </div>
                        <Suspense
                            fallback={
                                <div className='flex justify-center py-12'>
                                    <LoadingSpinner />
                                </div>
                            }
                        >
                            {selectedModule === 'music' && (
                                <MusicConfig guildId={selectedGuild.id} />
                            )}
                            {selectedModule === 'commands' && (
                                <CommandsConfig guildId={selectedGuild.id} />
                            )}
                        </Suspense>
                    </section>
                )}
            </div>
        </main>
    )
}
