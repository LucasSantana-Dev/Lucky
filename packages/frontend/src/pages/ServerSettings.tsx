import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Settings,
    Save,
    Loader2,
    Hash,
    Globe,
    Clock,
    UserCog,
    Bell,
    AlertTriangle,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import Skeleton from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import type { ServerSettings } from '@/types'

const TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
]

export default function ServerSettingsPage() {
    const { selectedGuild } = useGuildStore()
    const [settings, setSettings] = useState<ServerSettings>({
        nickname: '',
        commandPrefix: '!',
        managerRoles: [],
        updatesChannel: '',
        timezone: 'UTC',
        disableWarnings: false,
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!selectedGuild?.id) return
        setLoading(true)
        api.guilds
            .getSettings(selectedGuild.id)
            .then((res) => {
                if (res.data.settings) setSettings(res.data.settings)
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [selectedGuild?.id])

    const update = <K extends keyof ServerSettings>(
        key: K,
        value: ServerSettings[K],
    ) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
    }

    const handleSave = async () => {
        if (!selectedGuild?.id) return
        setSaving(true)
        try {
            await api.guilds.updateSettings(selectedGuild.id, settings)
            toast.success('Server settings saved!')
        } catch {
            toast.error('Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Settings className='w-16 h-16 text-lukbot-text-tertiary mb-4' />
                <h2 className='text-xl font-semibold text-white mb-2'>
                    No Server Selected
                </h2>
                <p className='text-lukbot-text-secondary text-sm'>
                    Select a server to manage settings
                </p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className='space-y-6'>
                <div>
                    <Skeleton className='h-8 w-48 mb-2' />
                    <Skeleton className='h-4 w-72' />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className='p-5 space-y-4'>
                        <Skeleton className='h-5 w-32' />
                        <Skeleton className='h-10 w-full' />
                        <Skeleton className='h-10 w-full' />
                    </Card>
                ))}
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex items-start justify-between'>
                <header>
                    <h1 className='text-2xl font-bold text-white'>
                        Server Settings
                    </h1>
                    <p className='text-sm text-lukbot-text-secondary mt-1'>
                        General configuration for {selectedGuild.name}
                    </p>
                </header>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className='bg-lukbot-red hover:bg-lukbot-red/90 gap-2'
                >
                    {saving ? (
                        <Loader2 className='w-4 h-4 animate-spin' />
                    ) : (
                        <Save className='w-4 h-4' />
                    )}
                    Save Changes
                </Button>
            </div>

            {/* General Settings */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0 }}
            >
                <Card className='p-5 space-y-5'>
                    <div className='flex items-center gap-2'>
                        <Settings className='w-5 h-5 text-lukbot-text-secondary' />
                        <h2 className='text-base font-semibold text-white'>
                            General
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='text-xs text-lukbot-text-secondary flex items-center gap-1.5'>
                                <UserCog className='w-3 h-3' /> Bot Nickname
                            </Label>
                            <Input
                                value={settings.nickname}
                                onChange={(e) =>
                                    update('nickname', e.target.value)
                                }
                                placeholder='LukBot'
                                className='bg-lukbot-bg-tertiary border-lukbot-border text-white'
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label className='text-xs text-lukbot-text-secondary flex items-center gap-1.5'>
                                <Hash className='w-3 h-3' /> Command Prefix
                            </Label>
                            <Input
                                value={settings.commandPrefix}
                                onChange={(e) =>
                                    update('commandPrefix', e.target.value)
                                }
                                placeholder='!'
                                maxLength={3}
                                className='bg-lukbot-bg-tertiary border-lukbot-border text-white w-24'
                            />
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Timezone & Notifications */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
            >
                <Card className='p-5 space-y-5'>
                    <div className='flex items-center gap-2'>
                        <Globe className='w-5 h-5 text-lukbot-text-secondary' />
                        <h2 className='text-base font-semibold text-white'>
                            Region & Notifications
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='text-xs text-lukbot-text-secondary flex items-center gap-1.5'>
                                <Clock className='w-3 h-3' /> Timezone
                            </Label>
                            <Select
                                value={settings.timezone}
                                onValueChange={(v) => update('timezone', v)}
                            >
                                <SelectTrigger className='bg-lukbot-bg-tertiary border-lukbot-border text-white'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className='bg-lukbot-bg-secondary border-lukbot-border'>
                                    {TIMEZONES.map((tz) => (
                                        <SelectItem key={tz} value={tz}>
                                            {tz}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className='space-y-2'>
                            <Label className='text-xs text-lukbot-text-secondary flex items-center gap-1.5'>
                                <Bell className='w-3 h-3' /> Updates Channel
                            </Label>
                            <Input
                                value={settings.updatesChannel}
                                onChange={(e) =>
                                    update('updatesChannel', e.target.value)
                                }
                                placeholder='Channel ID for bot updates'
                                className='bg-lukbot-bg-tertiary border-lukbot-border text-white'
                            />
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Warnings Toggle */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <Card className='p-5'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2 rounded-lg bg-yellow-500/15'>
                                <AlertTriangle className='w-4 h-4 text-yellow-400' />
                            </div>
                            <div>
                                <h3 className='text-sm font-semibold text-white'>
                                    Disable Command Warnings
                                </h3>
                                <p className='text-xs text-lukbot-text-tertiary mt-0.5'>
                                    Hide permission and cooldown warnings for
                                    users
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.disableWarnings}
                            onCheckedChange={(v) =>
                                update('disableWarnings', v)
                            }
                        />
                    </div>
                </Card>
            </motion.div>

            {/* Mobile Save Bar */}
            <div className='lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-lukbot-bg-primary/95 backdrop-blur-sm border-t border-lukbot-border z-30'>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className='w-full bg-lukbot-red hover:bg-lukbot-red/90 gap-2'
                >
                    {saving ? (
                        <Loader2 className='w-4 h-4 animate-spin' />
                    ) : (
                        <Save className='w-4 h-4' />
                    )}
                    Save Changes
                </Button>
            </div>
        </div>
    )
}
