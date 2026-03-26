import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'

interface GuildSwitcherProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export default function GuildSwitcher({ open, onOpenChange }: GuildSwitcherProps) {
    const location = useLocation()
    const prefersReducedMotion = useReducedMotion()
    const {
        guilds,
        selectedGuild,
        selectGuild,
        guildLoadError,
        isLoading,
        fetchGuilds,
    } = useGuildStore()

    useEffect(() => {
        onOpenChange(false)
    }, [location.pathname, onOpenChange])

    const showReauth =
        guildLoadError?.kind === 'auth' || guildLoadError?.kind === 'forbidden'
    const discordAuthUrl = api.auth.getDiscordLoginUrl()

    let errorMessage = guildLoadError?.message ?? ''
    if (guildLoadError?.kind === 'forbidden') {
        errorMessage = 'Discord access is missing required scope.'
    } else if (guildLoadError?.kind === 'network') {
        errorMessage = 'Network connection failed. Check connectivity and retry.'
    }

    const hasBotStatus = selectedGuild?.botAdded === false
    const iconSrc = selectedGuild?.icon
        ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png?size=64`
        : undefined

    return (
        <div className='relative px-2 py-2.5 border-b border-lucky-border'>
            <p className='type-meta mb-1.5 px-2 text-lucky-text-subtle'>
                Server
            </p>
            <button
                type='button'
                onClick={() => onOpenChange(!open)}
                aria-expanded={open}
                aria-haspopup='menu'
                aria-label={
                    selectedGuild
                        ? `Switch server, currently ${selectedGuild.name}`
                        : 'Select a server'
                }
                className='lucky-focus-visible flex w-full items-center gap-2.5 rounded-md border border-lucky-border bg-lucky-bg-tertiary px-2.5 py-2 text-left transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-active'
            >
                {selectedGuild ? (
                    <>
                        <Avatar className='h-6 w-6 shrink-0'>
                            <AvatarImage src={iconSrc} alt={selectedGuild.name} />
                            <AvatarFallback className='bg-lucky-bg-active text-[10px] font-semibold text-lucky-text-primary'>
                                {selectedGuild.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <span className='type-body-sm flex-1 truncate text-lucky-text-primary'>
                            {selectedGuild.name}
                        </span>
                        {hasBotStatus && (
                            <span className='rounded border border-lucky-border px-1.5 py-0.5 text-[10px] font-medium text-lucky-text-subtle shrink-0'>
                                No bot
                            </span>
                        )}
                    </>
                ) : (
                    <span className='type-body-sm flex-1 text-lucky-text-tertiary'>
                        Select a server
                    </span>
                )}
                <ChevronDown
                    className={cn(
                        'h-3.5 w-3.5 shrink-0 text-lucky-text-subtle transition-transform duration-150',
                        open && 'rotate-180',
                    )}
                    aria-hidden='true'
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.12 }}
                        className='absolute left-2 right-2 top-full z-50 mt-1 overflow-hidden rounded-lg border border-lucky-border bg-lucky-bg-secondary shadow-[0_8px_24px_rgb(0_0_0/0.4)]'
                        role='menu'
                        aria-label='Server list'
                    >
                        {guildLoadError && (
                            <div className='space-y-2 border-b border-lucky-border px-3 py-3 text-center'>
                                <p className='type-body-sm font-semibold text-lucky-text-primary'>
                                    Could not load servers
                                </p>
                                <p className='type-body-sm text-lucky-text-tertiary'>
                                    {errorMessage}
                                </p>
                                <div className='mt-3 flex items-center justify-center gap-2'>
                                    <button
                                        type='button'
                                        onClick={() => {
                                            Promise.resolve(fetchGuilds(true)).catch(() => {})
                                        }}
                                        className='lucky-focus-visible rounded-md border border-lucky-border px-2.5 py-1.5 type-body-sm text-lucky-text-secondary transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary'
                                    >
                                        Retry
                                    </button>
                                    {showReauth && (
                                        <a
                                            href={discordAuthUrl}
                                            className='lucky-focus-visible rounded-md border border-lucky-border px-2.5 py-1.5 type-body-sm text-lucky-text-secondary transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary'
                                        >
                                            Re-authenticate
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                        <ScrollArea className='max-h-56'>
                            <div>
                                {guilds.length === 0 ? (
                                    <div className='space-y-2 px-3 py-4 text-center'>
                                        {!guildLoadError && (
                                            <p className='type-body-sm text-lucky-text-tertiary'>
                                                {isLoading
                                                    ? 'Loading servers…'
                                                    : 'No accessible servers found'}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    guilds.map((guild) => {
                                        const isSelected = selectedGuild?.id === guild.id
                                        const guildIconSrc = guild.icon
                                            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
                                            : undefined
                                        return (
                                            <button
                                                key={guild.id}
                                                type='button'
                                                role='menuitemradio'
                                                aria-checked={isSelected}
                                                onClick={() => {
                                                    selectGuild(guild)
                                                    onOpenChange(false)
                                                }}
                                                className={cn(
                                                    'lucky-focus-visible flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-lucky-bg-tertiary',
                                                    isSelected && 'bg-lucky-bg-active',
                                                )}
                                            >
                                                <Avatar className='h-6 w-6 shrink-0'>
                                                    <AvatarImage src={guildIconSrc} alt={guild.name} />
                                                    <AvatarFallback className='bg-lucky-bg-active text-[10px] font-semibold text-lucky-text-primary'>
                                                        {guild.name.substring(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className='type-body-sm flex-1 truncate text-lucky-text-primary'>
                                                    {guild.name}
                                                </span>
                                                <span className='ml-auto flex items-center gap-2'>
                                                    {!guild.botAdded && (
                                                        <span className='rounded border border-lucky-border px-1.5 py-0.5 text-[10px] font-medium text-lucky-text-subtle'>
                                                            Invite bot
                                                        </span>
                                                    )}
                                                    {isSelected && (
                                                        <Check
                                                            className='h-3.5 w-3.5 text-lucky-brand'
                                                            aria-hidden='true'
                                                        />
                                                    )}
                                                </span>
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
