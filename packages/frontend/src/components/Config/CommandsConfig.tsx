import { useState, useEffect, useMemo } from 'react'
import { Terminal, Search, Filter } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

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
            console.error('Failed to load commands:', error)
            toast.error('Failed to load commands')
        }
    }

    const categories = useMemo(() => {
        return Array.from(new Set(commands.map((cmd) => cmd.category)))
    }, [commands])

    const filteredCommands = useMemo(() => {
        return commands.filter((cmd) => {
            const matchesSearch =
                searchQuery === '' ||
                cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesCategory = selectedCategory === null || cmd.category === selectedCategory
            return matchesSearch && matchesCategory
        })
    }, [commands, searchQuery, selectedCategory])

    const toggleCommand = async (commandId: string, enabled: boolean) => {
        try {
            await api.commands.toggle(guildId, commandId, enabled)
            setCommands((prev) =>
                prev.map((cmd) => (cmd.id === commandId ? { ...cmd, enabled } : cmd)),
            )
            toast.success(`Command ${enabled ? 'enabled' : 'disabled'}`)
        } catch (error) {
            toast.error('Failed to update command')
            console.error('Error toggling command:', error)
        }
    }

    return (
        <Card className='p-6'>
            <div className='flex items-center gap-2 mb-4'>
                <Terminal className='h-5 w-5 text-primary' aria-hidden='true' />
                <h2 className='text-xl font-bold text-white'>Commands Configuration</h2>
            </div>
            <p className='text-text-secondary mb-6'>Enable or disable bot commands</p>

            <div className='space-y-4'>
                <div className='relative'>
                    <Search
                        className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary'
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

                <div
                    className='flex flex-wrap gap-2'
                    role='group'
                    aria-label='Filter by category'
                >
                    <Button
                        type='button'
                        variant={selectedCategory === null ? 'primary' : 'ghost'}
                        size='sm'
                        onClick={() => setSelectedCategory(null)}
                        className='h-8'
                    >
                        All
                    </Button>
                    {categories.map((category) => (
                        <Button
                            key={category}
                            type='button'
                            variant={selectedCategory === category ? 'primary' : 'ghost'}
                            size='sm'
                            onClick={() => setSelectedCategory(category)}
                            className='h-8'
                        >
                            <Filter className='mr-1 h-3 w-3' aria-hidden='true' />
                            {category}
                        </Button>
                    ))}
                </div>

                <ScrollArea className='h-[400px] rounded-lg border border-bg-border bg-bg-tertiary'>
                    <div className='space-y-1 p-4'>
                        {filteredCommands.length === 0 ? (
                            <div className='flex h-32 items-center justify-center text-sm text-text-secondary'>
                                No commands found
                            </div>
                        ) : (
                            filteredCommands.map((command) => (
                                <div
                                    key={command.id}
                                    className={cn(
                                        'flex flex-row items-center justify-between rounded-lg border border-bg-border bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary',
                                    )}
                                >
                                    <div className='flex-1 space-y-1'>
                                        <div className='flex items-center gap-2'>
                                            <span className='text-base font-medium text-white'>
                                                /{command.name}
                                            </span>
                                            <Badge variant='secondary' className='text-xs'>
                                                {command.category}
                                            </Badge>
                                        </div>
                                        <p className='text-sm text-text-secondary'>
                                            {command.description}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={command.enabled}
                                        onCheckedChange={(checked) =>
                                            toggleCommand(command.id, checked)
                                        }
                                        aria-label={`Toggle ${command.name} command`}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>

                <div className='text-sm text-text-secondary' role='status' aria-live='polite'>
                    Showing {filteredCommands.length} of {commands.length} commands
                </div>
            </div>
        </Card>
    )
}
