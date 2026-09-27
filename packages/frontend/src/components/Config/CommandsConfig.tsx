import { reportError } from '@/lib/sentry'
import { useState, useEffect, useMemo } from 'react'
import { Terminal, Search } from 'lucide-react'
import Card from '@/components/ui/Card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { api } from '@/services/api'
import type { Command } from '@/types'
import { cn } from '@/lib/utils'

interface CommandsConfigProps {
    guildId: string
}

export default function CommandsConfig({ guildId }: CommandsConfigProps) {
    const [commands, setCommands] = useState<Command[]>([])
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        if (guildId) {
            loadCommands()
        }
    }, [guildId])

    const loadCommands = async () => {
        try {
            const response = await api.commands.list(guildId)
            setCommands(response.data.commands)
        } catch (error) {
            reportError('Failed to load commands:', error, {
                component: 'CommandsConfig',
                action: 'loadCommands',
            })
            toast.error('Failed to load commands')
        }
    }

    const filteredCommands = useMemo(() => {
        return commands.filter((cmd) => {
            const q = searchQuery.toLowerCase()
            return (
                q === '' ||
                cmd.name.toLowerCase().includes(q) ||
                (cmd.description ?? '').toLowerCase().includes(q)
            )
        })
    }, [commands, searchQuery])

    const toggleCommand = async (command: Command, enabled: boolean) => {
        try {
            await api.commands.toggle(guildId, command.name, enabled)
            setCommands((prev) =>
                prev.map((cmd) =>
                    cmd.id === command.id ? { ...cmd, enabled } : cmd,
                ),
            )
            toast.success(`Command ${enabled ? 'enabled' : 'disabled'}`)
        } catch (error) {
            toast.error('Failed to update command')
            reportError('Error toggling command:', error, {
                component: 'CommandsConfig',
                action: 'toggleCommand',
            })
        }
    }

    return (
        <Card className='p-6'>
            <div className='flex items-center gap-2 mb-4'>
                <Terminal className='h-5 w-5 text-primary' aria-hidden='true' />
                <h2 className='text-xl font-bold text-white'>
                    Commands Configuration
                </h2>
            </div>
            <p className='text-lucky-text-secondary mb-6'>
                Enable or disable bot commands
            </p>

            <div className='space-y-4'>
                <div className='relative'>
                    <Search
                        className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lucky-text-secondary'
                        aria-hidden='true'
                    />
                    <Input
                        type='search'
                        placeholder='Search commands...'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='pl-9'
                        aria-label='Search commands'
                    />
                </div>

                <ScrollArea className='h-[400px] rounded-lg border border-lucky-border bg-lucky-bg-tertiary'>
                    <div className='space-y-1 p-4'>
                        {filteredCommands.length === 0 ? (
                            <div className='flex h-32 items-center justify-center text-sm text-lucky-text-secondary'>
                                No commands found
                            </div>
                        ) : (
                            filteredCommands.map((command) => (
                                <div
                                    key={command.id}
                                    className={cn(
                                        'flex flex-row items-center justify-between rounded-lg border border-lucky-border bg-lucky-bg-secondary p-4 transition-colors hover:bg-lucky-bg-tertiary',
                                    )}
                                >
                                    <div className='flex-1 space-y-1'>
                                        <div className='flex items-center gap-2'>
                                            <span className='text-base font-medium text-white'>
                                                /{command.name}
                                            </span>
                                        </div>
                                        <p className='text-sm text-lucky-text-secondary'>
                                            {command.description}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={command.enabled}
                                        onCheckedChange={(checked: boolean) =>
                                            toggleCommand(command, checked)
                                        }
                                        aria-label={`Toggle ${command.name} command`}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>

                <div
                    className='text-sm text-lucky-text-secondary'
                    role='status'
                    aria-live='polite'
                >
                    Showing {filteredCommands.length} of {commands.length}{' '}
                    commands
                </div>
            </div>
        </Card>
    )
}
