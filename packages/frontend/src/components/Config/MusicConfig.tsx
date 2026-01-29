import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Music2, Volume2, Repeat, Shuffle, Save } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { useGuildSelection } from '@/hooks/useGuildSelection'

const musicConfigSchema = z.object({
    volume: z.number().min(0).max(100),
    autoplay: z.boolean(),
    repeatMode: z.enum(['off', 'track', 'queue']),
    shuffle: z.boolean(),
})

type MusicConfigValues = z.infer<typeof musicConfigSchema>

interface MusicConfigProps {
    guildId: string
}

export default function MusicConfig({ guildId }: MusicConfigProps) {
    const [isLoading, setIsLoading] = useState(false)
    const { selectedGuild } = useGuildSelection()

    const form = useForm<MusicConfigValues>({
        resolver: zodResolver(musicConfigSchema),
        defaultValues: {
            volume: 50,
            autoplay: false,
            repeatMode: 'off',
            shuffle: false,
        },
    })

    useEffect(() => {
        if (guildId) {
            loadSettings()
        }
    }, [guildId])

    const loadSettings = async () => {
        try {
            const response = await api.modules.getSettings(guildId, 'music')
            if (response.data.settings) {
                form.reset({
                    volume: (response.data.settings.volume as number) ?? 50,
                    autoplay:
                        (response.data.settings.autoplay as boolean) ?? false,
                    repeatMode: ((response.data.settings.repeatMode as
                        | 'off'
                        | 'track'
                        | 'queue') ?? 'off') as 'off' | 'track' | 'queue',
                    shuffle:
                        (response.data.settings.shuffle as boolean) ?? false,
                })
            }
        } catch (error) {
            console.error('Failed to load music settings:', error)
        }
    }

    const onSubmit = async (data: MusicConfigValues) => {
        if (!selectedGuild) return

        setIsLoading(true)
        try {
            await api.modules.updateSettings(guildId, 'music', data)
            toast.success('Music configuration saved successfully!')
        } catch (error) {
            toast.error('Failed to save music configuration')
            console.error('Error saving music config:', error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className='p-6'>
            <div className='flex items-center gap-2 mb-4'>
                <Music2 className='h-5 w-5 text-primary' aria-hidden='true' />
                <h2 className='text-xl font-bold text-white'>
                    Music Configuration
                </h2>
            </div>
            <p className='text-text-secondary mb-6'>
                Configure music playback settings for your Discord bot
            </p>

            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
                <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                        <Label
                            htmlFor='volume'
                            className='flex items-center gap-2'
                        >
                            <Volume2 className='h-4 w-4' aria-hidden='true' />
                            Volume
                        </Label>
                        <span
                            className='text-sm font-medium text-text-secondary'
                            aria-live='polite'
                        >
                            {form.watch('volume')}%
                        </span>
                    </div>
                    <Input
                        id='volume'
                        type='range'
                        min={0}
                        max={100}
                        step={1}
                        {...form.register('volume', { valueAsNumber: true })}
                        className='w-full'
                        aria-label='Volume level'
                    />
                    <p className='text-xs text-text-secondary'>
                        Set the default volume level (0-100)
                    </p>
                </div>

                <div className='flex items-center justify-between rounded-lg border border-bg-border bg-bg-tertiary p-4'>
                    <div className='space-y-0.5'>
                        <Label htmlFor='autoplay' className='text-base'>
                            Autoplay
                        </Label>
                        <p className='text-xs text-text-secondary'>
                            Automatically play next song in queue
                        </p>
                    </div>
                    <Switch
                        id='autoplay'
                        checked={form.watch('autoplay')}
                        onCheckedChange={(checked) =>
                            form.setValue('autoplay', checked)
                        }
                        aria-label='Toggle autoplay'
                    />
                </div>

                <div className='space-y-2'>
                    <Label
                        htmlFor='repeatMode'
                        className='flex items-center gap-2'
                    >
                        <Repeat className='h-4 w-4' aria-hidden='true' />
                        Repeat Mode
                    </Label>
                    <Select
                        value={form.watch('repeatMode')}
                        onValueChange={(value) =>
                            form.setValue(
                                'repeatMode',
                                value as 'off' | 'track' | 'queue',
                            )
                        }
                    >
                        <SelectTrigger
                            id='repeatMode'
                            aria-label='Select repeat mode'
                        >
                            <SelectValue placeholder='Select repeat mode' />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='off'>Off</SelectItem>
                            <SelectItem value='track'>Repeat Track</SelectItem>
                            <SelectItem value='queue'>Repeat Queue</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className='text-xs text-text-secondary'>
                        Choose how music should repeat
                    </p>
                </div>

                <div className='flex items-center justify-between rounded-lg border border-bg-border bg-bg-tertiary p-4'>
                    <div className='space-y-0.5'>
                        <Label
                            htmlFor='shuffle'
                            className='text-base flex items-center gap-2'
                        >
                            <Shuffle className='h-4 w-4' aria-hidden='true' />
                            Shuffle
                        </Label>
                        <p className='text-xs text-text-secondary'>
                            Randomize playback order
                        </p>
                    </div>
                    <Switch
                        id='shuffle'
                        checked={form.watch('shuffle')}
                        onCheckedChange={(checked) =>
                            form.setValue('shuffle', checked)
                        }
                        aria-label='Toggle shuffle'
                    />
                </div>

                <Button
                    type='submit'
                    disabled={isLoading}
                    loading={isLoading}
                    className='w-full'
                >
                    <Save className='mr-2 h-4 w-4' aria-hidden='true' />
                    Save Configuration
                </Button>
            </form>
        </Card>
    )
}
