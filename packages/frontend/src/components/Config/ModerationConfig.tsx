import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Shield, AlertTriangle, Save } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { api } from '@/services/api'
import ModerationFilterOptions from './ModerationFilterOptions'

const moderationConfigSchema = z.object({
    autoModeration: z.boolean(),
    spamFilter: z.boolean(),
    linkFilter: z.boolean(),
    profanityFilter: z.boolean(),
    capsFilter: z.boolean(),
    mentionSpamFilter: z.boolean(),
    defaultAction: z.enum(['warn', 'mute', 'kick', 'ban']),
    spamAction: z.enum(['warn', 'mute', 'kick', 'ban']),
    profanityAction: z.enum(['warn', 'mute', 'kick', 'ban']),
    autoDeleteMessages: z.boolean(),
    logActions: z.boolean(),
})

type ModerationConfigValues = z.infer<typeof moderationConfigSchema>

interface ModerationConfigProps {
    guildId: string
}

export default function ModerationConfig({ guildId }: ModerationConfigProps) {
    const [isLoading, setIsLoading] = useState(false)

    const form = useForm<ModerationConfigValues>({
        resolver: zodResolver(moderationConfigSchema),
        defaultValues: {
            autoModeration: true,
            spamFilter: true,
            linkFilter: false,
            profanityFilter: true,
            capsFilter: false,
            mentionSpamFilter: true,
            defaultAction: 'warn',
            spamAction: 'mute',
            profanityAction: 'warn',
            autoDeleteMessages: true,
            logActions: true,
        },
    })

    useEffect(() => {
        if (guildId) {
            loadSettings()
        }
    }, [guildId])

    const loadSettings = async () => {
        try {
            const response = await api.modules.getSettings(guildId, 'moderation')
            if (response.data.settings) {
                form.reset(response.data.settings as ModerationConfigValues)
            }
        } catch (error) {
            console.error('Failed to load moderation settings:', error)
        }
    }

    const onSubmit = async (data: ModerationConfigValues) => {
        setIsLoading(true)
        try {
            await api.modules.updateSettings(guildId, 'moderation', data)
            toast.success('Moderation configuration saved successfully!')
        } catch (error) {
            toast.error('Failed to save moderation configuration')
            console.error('Error saving moderation config:', error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className='p-6'>
            <div className='flex items-center gap-2 mb-4'>
                <Shield className='h-5 w-5 text-primary' aria-hidden='true' />
                <h2 className='text-xl font-bold text-white'>Moderation Configuration</h2>
            </div>
            <p className='text-text-secondary mb-6'>
                Configure auto-moderation and moderation actions
            </p>

            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
                <div className='flex flex-row items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 p-4'>
                    <div className='space-y-0.5'>
                        <Label className='text-base font-semibold flex items-center gap-2'>
                            <Shield className='h-4 w-4' aria-hidden='true' />
                            Auto-Moderation
                        </Label>
                        <p className='text-xs text-text-secondary'>
                            Enable automatic moderation for your server
                        </p>
                    </div>
                    <Switch
                        checked={form.watch('autoModeration')}
                        onCheckedChange={(checked) => form.setValue('autoModeration', checked)}
                        aria-label='Toggle auto-moderation'
                    />
                </div>

                <ModerationFilterOptions form={form} />

                <div className='border-t border-bg-border pt-4'>
                    <div className='flex items-center gap-2 mb-4'>
                        <AlertTriangle
                            className='h-4 w-4 text-text-secondary'
                            aria-hidden='true'
                        />
                        <h3 className='text-lg font-semibold text-white'>Moderation Actions</h3>
                    </div>

                    {[
                        { key: 'defaultAction', label: 'Default Action', desc: 'Default action for rule violations' },
                        { key: 'spamAction', label: 'Spam Detection Action', desc: 'Action taken when spam is detected' },
                        { key: 'profanityAction', label: 'Profanity Filter Action', desc: 'Action taken when profanity is detected' },
                    ].map(({ key, label, desc }) => (
                        <div key={key} className='space-y-2 mb-4'>
                            <Label>{label}</Label>
                            <Select
                                value={form.watch(key as keyof ModerationConfigValues) as string}
                                onValueChange={(value) =>
                                    form.setValue(
                                        key as keyof ModerationConfigValues,
                                        value as 'warn' | 'mute' | 'kick' | 'ban',
                                    )
                                }
                            >
                                <SelectTrigger aria-label={`Select ${label.toLowerCase()}`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value='warn'>Warn</SelectItem>
                                    <SelectItem value='mute'>Mute</SelectItem>
                                    <SelectItem value='kick'>Kick</SelectItem>
                                    <SelectItem value='ban'>Ban</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className='text-xs text-text-secondary'>{desc}</p>
                        </div>
                    ))}
                </div>

                <div className='border-t border-bg-border pt-4 space-y-3'>
                    {[
                        {
                            key: 'autoDeleteMessages',
                            label: 'Auto-Delete Flagged Messages',
                            desc: 'Automatically delete messages that violate rules',
                        },
                        {
                            key: 'logActions',
                            label: 'Log Moderation Actions',
                            desc: 'Keep a log of all moderation actions',
                        },
                    ].map(({ key, label, desc }) => (
                        <div
                            key={key}
                            className='flex flex-row items-center justify-between rounded-lg border border-bg-border bg-bg-tertiary p-4'
                        >
                            <div className='space-y-0.5'>
                                <Label className='text-base'>{label}</Label>
                                <p className='text-xs text-text-secondary'>{desc}</p>
                            </div>
                            <Switch
                                checked={form.watch(key as keyof ModerationConfigValues) as boolean}
                                onCheckedChange={(checked) =>
                                    form.setValue(key as keyof ModerationConfigValues, checked)
                                }
                                aria-label={`Toggle ${label.toLowerCase()}`}
                            />
                        </div>
                    ))}
                </div>

                <Button type='submit' disabled={isLoading} loading={isLoading} className='w-full'>
                    <Save className='mr-2 h-4 w-4' aria-hidden='true' />
                    Save Configuration
                </Button>
            </form>
        </Card>
    )
}
