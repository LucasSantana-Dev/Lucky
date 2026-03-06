import { MessageSquareOff } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { UseFormReturn } from 'react-hook-form'

interface ModerationConfigValues {
    autoModeration: boolean
    spamFilter: boolean
    linkFilter: boolean
    profanityFilter: boolean
    capsFilter: boolean
    mentionSpamFilter: boolean
    defaultAction: 'warn' | 'mute' | 'kick' | 'ban'
    spamAction: 'warn' | 'mute' | 'kick' | 'ban'
    profanityAction: 'warn' | 'mute' | 'kick' | 'ban'
    autoDeleteMessages: boolean
    logActions: boolean
}

const FILTER_OPTIONS = [
    { key: 'spamFilter', label: 'Spam Filter', desc: 'Detect and prevent spam messages' },
    { key: 'linkFilter', label: 'Link Filter', desc: 'Block unauthorized links' },
    { key: 'profanityFilter', label: 'Profanity Filter', desc: 'Filter inappropriate language' },
    { key: 'capsFilter', label: 'Excessive Caps Filter', desc: 'Limit excessive use of capital letters' },
    { key: 'mentionSpamFilter', label: 'Mention Spam Filter', desc: 'Prevent excessive user mentions' },
] as const

interface ModerationFilterOptionsProps {
    form: UseFormReturn<ModerationConfigValues>
}

export default function ModerationFilterOptions({ form }: ModerationFilterOptionsProps) {
    return (
        <div className='border-t border-bg-border pt-4'>
            <div className='flex items-center gap-2 mb-4'>
                <MessageSquareOff className='h-4 w-4 text-text-secondary' aria-hidden='true' />
                <h3 className='text-lg font-semibold text-white'>Filter Options</h3>
            </div>
            <div className='space-y-3 rounded-lg border border-bg-border bg-bg-tertiary p-4'>
                {FILTER_OPTIONS.map(({ key, label, desc }) => (
                    <div key={key} className='flex flex-row items-center justify-between rounded-md bg-bg-secondary p-3'>
                        <div className='space-y-0.5'>
                            <Label className='text-sm font-medium'>{label}</Label>
                            <p className='text-xs text-text-secondary'>{desc}</p>
                        </div>
                        <Switch
                            checked={form.watch(key as keyof ModerationConfigValues) as boolean}
                            onCheckedChange={(checked) => form.setValue(key as keyof ModerationConfigValues, checked)}
                            aria-label={`Toggle ${label.toLowerCase()}`}
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
