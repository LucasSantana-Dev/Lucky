import {
    useState,
    useEffect,
    useCallback,
    useRef,
    type ReactElement,
} from 'react'
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
    Plus,
    Trash2,
    Shield,
    RotateCcw,
    WandSparkles,
    X,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
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
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import { RBAC_MODULES, type RoleGrant, type ServerSettings, type GuildChannelOption, type GuildRoleOption } from '@/types'

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

type SettingsLoadErrorKind = 'auth' | 'forbidden' | 'network' | 'upstream'

type SettingsLoadError = {
    kind: SettingsLoadErrorKind
    message: string
}

const DEFAULT_SETTINGS: ServerSettings = {
    nickname: '',
    commandPrefix: '!',
    managerRoles: [],
    updatesChannel: '',
    timezone: 'UTC',
    disableWarnings: false,
}

function classifySettingsLoadError(error: unknown): SettingsLoadError {
    if (error instanceof ApiError) {
        if (error.status === 401) {
            return {
                kind: 'auth',
                message: 'Session expired. Please sign in again.',
            }
        }

        if (error.status === 403) {
            return {
                kind: 'forbidden',
                message: 'You no longer have access to this server settings.',
            }
        }

        if (error.status === 0) {
            return {
                kind: 'network',
                message: 'Unable to reach API. Check your connection and retry.',
            }
        }

        return {
            kind: 'upstream',
            message: error.message || 'Failed to load server settings.',
        }
    }

    if (error instanceof Error) {
        return { kind: 'upstream', message: error.message }
    }

    return {
        kind: 'upstream',
        message: 'Failed to load server settings.',
    }
}

export default function ServerSettingsPage() {
    const { selectedGuild, memberContext } = useGuildStore()
    const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)
    const [settingsLoadError, setSettingsLoadError] =
        useState<SettingsLoadError | null>(null)
    const [saving, setSaving] = useState(false)
    const [rbacLoading, setRbacLoading] = useState(false)
    const [rbacSaving, setRbacSaving] = useState(false)
    const [applyingCriativariaPreset, setApplyingCriativariaPreset] =
        useState(false)
    const [rbacRolesError, setRbacRolesError] = useState<string | null>(null)
    const [rbacRoles, setRbacRoles] = useState<
        Array<{ id: string; name: string }>
    >([])
    const [rbacGrants, setRbacGrants] = useState<RoleGrant[]>([])
    const [channels, setChannels] = useState<GuildChannelOption[]>([])
    const [managerRoleOptions, setManagerRoleOptions] = useState<GuildRoleOption[]>([])
    const rbacRequestIdRef = useRef(0)
    const settingsRequestVersion = useRef(0)

    const canManageRbac =
        memberContext?.canManageRbac ?? selectedGuild?.canManageRbac ?? false

    const loadRbac = useCallback(async (guildId: string) => {
        const requestId = rbacRequestIdRef.current + 1
        rbacRequestIdRef.current = requestId
        setRbacLoading(true)
        setRbacRolesError(null)
        try {
            const res = await api.guilds.getRbac(guildId)
            if (requestId !== rbacRequestIdRef.current) {
                return
            }
            setRbacRoles(res.data.roles)
            setRbacGrants(res.data.grants)
            if (res.data.roles.length === 0) {
                setRbacRolesError(
                    'No assignable roles found for this server yet.',
                )
            }
        } catch (error) {
            if (requestId !== rbacRequestIdRef.current) {
                return
            }
            const detailsMessage =
                error instanceof ApiError
                    ? error.message
                    : 'Failed to load role options for access rules.'
            setRbacRoles([])
            setRbacGrants([])
            setRbacRolesError(detailsMessage)
            toast.error(detailsMessage)
        } finally {
            if (requestId === rbacRequestIdRef.current) {
                setRbacLoading(false)
            }
        }
    }, [])

    const loadSettings = useCallback(async (guildId: string) => {
        const requestVersion = ++settingsRequestVersion.current
        const isStaleRequest = () =>
            requestVersion !== settingsRequestVersion.current

        setLoading(true)
        setSettingsLoadError(null)

        try {
            const response = await api.guilds.getSettings(guildId)
            if (isStaleRequest()) {
                return
            }
            setSettings(response.data.settings ?? DEFAULT_SETTINGS)
        } catch (error) {
            if (isStaleRequest()) {
                return
            }
            setSettings(DEFAULT_SETTINGS)
            setSettingsLoadError(classifySettingsLoadError(error))
        } finally {
            if (!isStaleRequest()) {
                setLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        if (!selectedGuild?.id) {
            return
        }

        void loadSettings(selectedGuild.id)
    }, [selectedGuild?.id, loadSettings])

    useEffect(() => {
        if (!selectedGuild?.id || !canManageRbac) {
            rbacRequestIdRef.current += 1
            setRbacRoles([])
            setRbacGrants([])
            setRbacRolesError(null)
            return
        }

        loadRbac(selectedGuild.id)
    }, [selectedGuild?.id, canManageRbac, loadRbac])

    useEffect(() => {
        if (!selectedGuild?.id) return
        api.guilds
            .getChannels(selectedGuild.id)
            .then((res) => setChannels(res.data.channels))
            .catch(() => setChannels([]))
        api.guilds
            .getRbac(selectedGuild.id)
            .then((res) => setManagerRoleOptions(res.data.roles))
            .catch(() => setManagerRoleOptions([]))
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

    const addRbacGrant = () => {
        if (rbacLoading) {
            toast.error('Still loading role options. Try again in a moment.')
            return
        }

        if (rbacRoles.length === 0) {
            toast.error(
                rbacRolesError ??
                    'Role options are not available yet. Retry loading roles.',
            )
            return
        }

        setRbacGrants((prev) => [
            ...prev,
            {
                roleId: rbacRoles[0].id,
                module: 'overview',
                mode: 'view',
            },
        ])
    }

    const updateRbacGrant = (index: number, updates: Partial<RoleGrant>) => {
        setRbacGrants((prev) =>
            prev.map((grant, currentIndex) =>
                currentIndex === index
                    ? {
                          ...grant,
                          ...updates,
                      }
                    : grant,
            ),
        )
    }

    const removeRbacGrant = (index: number) => {
        setRbacGrants((prev) =>
            prev.filter((_, currentIndex) => currentIndex !== index),
        )
    }

    const handleSaveRbac = async () => {
        if (!selectedGuild?.id || !canManageRbac) {
            return
        }

        setRbacSaving(true)
        try {
            const response = await api.guilds.updateRbac(
                selectedGuild.id,
                rbacGrants,
            )
            setRbacGrants(response.data.grants)
            toast.success('Access control policy saved')
        } catch {
            toast.error('Failed to save access control policy')
        } finally {
            setRbacSaving(false)
        }
    }

    const handleApplyCriativariaPreset = async () => {
        if (!selectedGuild?.id || !canManageRbac) {
            return
        }

        setApplyingCriativariaPreset(true)
        try {
            const response = await api.guilds.applyCriativariaPreset(
                selectedGuild.id,
            )
            toast.success(
                `Criativaria baseline applied (${response.data.run.status})`,
            )
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message)
            } else {
                toast.error('Failed to apply Criativaria baseline')
            }
        } finally {
            setApplyingCriativariaPreset(false)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Settings className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    No Server Selected
                </h2>
                <p className='type-body text-lucky-text-secondary'>
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

    if (settingsLoadError) {
        return (
            <div className='space-y-6'>
                <header>
                    <h1 className='type-h1 text-lucky-text-primary'>
                        Server Settings
                    </h1>
                    <p className='type-body text-lucky-text-secondary mt-1'>
                        General configuration for {selectedGuild.name}
                    </p>
                </header>
                <Card className='p-5 space-y-4'>
                    <div className='flex items-center gap-2 text-lucky-yellow'>
                        <AlertTriangle className='w-5 h-5' />
                        <h2 className='type-title text-lucky-text-primary'>
                            Unable to load server settings
                        </h2>
                    </div>
                    <p className='type-body text-lucky-text-secondary'>
                        {settingsLoadError.message}
                    </p>
                    <div className='flex items-center gap-3'>
                        <Button
                            type='button'
                            onClick={() => {
                                if (!selectedGuild?.id) {
                                    return
                                }
                                void loadSettings(selectedGuild.id)
                            }}
                        >
                            Retry
                        </Button>
                        {(settingsLoadError.kind === 'auth' ||
                            settingsLoadError.kind === 'forbidden') && (
                            <a
                                href={api.auth.getDiscordLoginUrl()}
                                className='type-body-sm text-lucky-text-secondary hover:text-lucky-text-primary'
                            >
                                Re-authenticate
                            </a>
                        )}
                    </div>
                </Card>
            </div>
        )
    }

    let rbacContent: ReactElement
    if (!canManageRbac) {
        rbacContent = (
            <div className='rounded-xl border border-lucky-border bg-lucky-bg-tertiary/50 p-4'>
                <p className='type-body text-lucky-text-secondary'>
                    Only server owner or users with Administrator/Manage Server
                    permission can manage RBAC policy.
                </p>
            </div>
        )
    } else if (rbacLoading) {
        rbacContent = (
            <div className='space-y-3'>
                {['rbac-skeleton-1', 'rbac-skeleton-2', 'rbac-skeleton-3'].map(
                    (skeletonKey) => (
                        <Skeleton key={skeletonKey} className='h-12 w-full' />
                    ),
                )}
            </div>
        )
    } else {
        rbacContent = (
            <div className='space-y-3'>
                {rbacRolesError && (
                    <div className='rounded-xl border border-lucky-border bg-lucky-bg-tertiary/50 p-3 type-body-sm text-lucky-text-secondary'>
                        <div className='flex items-center justify-between gap-3'>
                            <span>{rbacRolesError}</span>
                            {selectedGuild?.id && (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='ghost'
                                    className='gap-2'
                                    onClick={() => {
                                        loadRbac(selectedGuild.id)
                                    }}
                                >
                                    <RotateCcw className='w-4 h-4' />
                                    Retry Roles
                                </Button>
                            )}
                        </div>
                    </div>
                )}
                {rbacGrants.length === 0 ? (
                    <p className='type-body-sm text-lucky-text-tertiary'>
                        No RBAC rules configured. Add a rule to grant module
                        access.
                    </p>
                ) : (
                    rbacGrants.map((grant, index) => (
                        <div
                            key={`${grant.roleId}:${grant.module}:${grant.mode}:${index}`}
                            className='grid grid-cols-1 gap-3 rounded-xl border border-lucky-border bg-lucky-bg-tertiary/50 p-3 md:grid-cols-[1.4fr_1fr_1fr_auto]'
                        >
                            <Select
                                value={grant.roleId}
                                onValueChange={(value) =>
                                    updateRbacGrant(index, {
                                        roleId: value,
                                    })
                                }
                            >
                                <SelectTrigger className='bg-lucky-bg-secondary border-lucky-border text-white'>
                                    <SelectValue placeholder='Role' />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    {rbacRoles.map((role) => (
                                        <SelectItem key={role.id} value={role.id}>
                                            {role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={grant.module}
                                onValueChange={(value) =>
                                    updateRbacGrant(index, {
                                        module: value as RoleGrant['module'],
                                    })
                                }
                            >
                                <SelectTrigger className='bg-lucky-bg-secondary border-lucky-border text-white'>
                                    <SelectValue placeholder='Module' />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    {RBAC_MODULES.map((module) => (
                                        <SelectItem key={module} value={module}>
                                            {module}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={grant.mode}
                                onValueChange={(value) =>
                                    updateRbacGrant(index, {
                                        mode: value as RoleGrant['mode'],
                                    })
                                }
                            >
                                <SelectTrigger className='bg-lucky-bg-secondary border-lucky-border text-white'>
                                    <SelectValue placeholder='Mode' />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    <SelectItem value='view'>view</SelectItem>
                                    <SelectItem value='manage'>manage</SelectItem>
                                </SelectContent>
                            </Select>

                            <Button
                                type='button'
                                variant='ghost'
                                className='text-lucky-text-tertiary hover:text-lucky-error'
                                onClick={() => removeRbacGrant(index)}
                            >
                                <Trash2 className='w-4 h-4' />
                            </Button>
                        </div>
                    ))
                )}
            </div>
        )
    }

    const availableManagerRoles = managerRoleOptions.filter(
        (r) => !(settings.managerRoles ?? []).includes(r.id),
    )
    const getManagerRoleName = (id: string) =>
        managerRoleOptions.find((r) => r.id === id)?.name ?? id

    return (
        <div className='space-y-6 lg:pb-0 pb-24'>
            <div className='flex items-start justify-between'>
                <header>
                    <h1 className='type-h1 text-lucky-text-primary'>
                        Server Settings
                    </h1>
                    <p className='type-body text-lucky-text-secondary mt-1'>
                        General configuration for {selectedGuild.name}
                    </p>
                </header>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className='bg-lucky-red hover:bg-lucky-red/90 gap-2'
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
                        <Settings className='w-5 h-5 text-lucky-text-secondary' />
                        <h2 className='type-title text-lucky-text-primary'>
                            General
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <UserCog className='w-3 h-3' /> Bot Nickname
                            </Label>
                            <Input
                                value={settings.nickname}
                                onChange={(e) =>
                                    update('nickname', e.target.value)
                                }
                                placeholder='Lucky'
                                className='bg-lucky-bg-tertiary border-lucky-border text-white'
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Hash className='w-3 h-3' /> Command Prefix
                            </Label>
                            <Input
                                value={settings.commandPrefix}
                                onChange={(e) =>
                                    update('commandPrefix', e.target.value)
                                }
                                placeholder='!'
                                maxLength={3}
                                className='bg-lucky-bg-tertiary border-lucky-border text-white w-24'
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
                        <Globe className='w-5 h-5 text-lucky-text-secondary' />
                        <h2 className='type-title text-lucky-text-primary'>
                            Region & Notifications
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Clock className='w-3 h-3' /> Timezone
                            </Label>
                            <Select
                                value={settings.timezone}
                                onValueChange={(v) => update('timezone', v)}
                            >
                                <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border text-white'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    {TIMEZONES.map((tz) => (
                                        <SelectItem key={tz} value={tz}>
                                            {tz}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Bell className='w-3 h-3' /> Updates Channel
                            </Label>
                            {channels.length > 0 ? (
                                <Select
                                    value={settings.updatesChannel || '__none__'}
                                    onValueChange={(v) =>
                                        update('updatesChannel', v === '__none__' ? '' : v)
                                    }
                                >
                                    <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border text-white'>
                                        <SelectValue placeholder='Select a channel...' />
                                    </SelectTrigger>
                                    <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                        <SelectItem value='__none__'>
                                            <span className='text-lucky-text-tertiary'>None</span>
                                        </SelectItem>
                                        {channels.map((ch) => (
                                            <SelectItem key={ch.id} value={ch.id}>
                                                <span className='flex items-center gap-2'>
                                                    <Hash className='w-3 h-3 text-lucky-text-tertiary' />
                                                    {ch.name}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    value={settings.updatesChannel}
                                    onChange={(e) =>
                                        update('updatesChannel', e.target.value)
                                    }
                                    placeholder='Channel ID for bot updates'
                                    className='bg-lucky-bg-tertiary border-lucky-border text-white'
                                />
                            )}
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Manager Roles */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
            >
                <Card className='p-5 space-y-4'>
                    <div className='flex items-center gap-2'>
                        <Shield className='w-5 h-5 text-lucky-text-secondary' />
                        <div>
                            <h2 className='type-title text-lucky-text-primary'>
                                Manager Roles
                            </h2>
                            <p className='type-meta text-lucky-text-tertiary mt-0.5'>
                                Roles that can manage bot settings via commands
                            </p>
                        </div>
                    </div>
                    {managerRoleOptions.length > 0 && availableManagerRoles.length > 0 && (
                        <Select
                            onValueChange={(id) => {
                                update('managerRoles', [...(settings.managerRoles ?? []), id])
                            }}
                        >
                            <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border text-white h-9 text-sm'>
                                <SelectValue placeholder='Add a manager role...' />
                            </SelectTrigger>
                            <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                {availableManagerRoles.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                        {role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {(settings.managerRoles ?? []).length > 0 ? (
                        <div className='flex flex-wrap gap-1.5'>
                            {(settings.managerRoles ?? []).map((id) => (
                                <Badge
                                    key={id}
                                    variant='outline'
                                    className='bg-lucky-bg-tertiary border-lucky-border text-lucky-text-secondary text-xs gap-1 pr-1'
                                >
                                    <Shield className='w-3 h-3' />
                                    {getManagerRoleName(id)}
                                    <button
                                        onClick={() =>
                                            update(
                                                'managerRoles',
                                                (settings.managerRoles ?? []).filter(
                                                    (r) => r !== id,
                                                ),
                                            )
                                        }
                                        className='hover:text-lucky-error transition-colors p-0.5'
                                    >
                                        <X className='w-3 h-3' />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className='type-meta text-lucky-text-tertiary'>
                            No manager roles configured.
                        </p>
                    )}
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
                                <h3 className='type-body-sm font-semibold text-lucky-text-primary'>
                                    Disable Command Warnings
                                </h3>
                                <p className='type-meta text-lucky-text-tertiary mt-0.5'>
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
            <div className='lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-lucky-bg-primary/95 backdrop-blur-sm border-t border-lucky-border z-30'>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className='w-full bg-lucky-red hover:bg-lucky-red/90 gap-2'
                >
                    {saving ? (
                        <Loader2 className='w-4 h-4 animate-spin' />
                    ) : (
                        <Save className='w-4 h-4' />
                    )}
                    Save Changes
                </Button>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
            >
                <Card className='p-5 space-y-4'>
                    <div className='flex items-center justify-between gap-4'>
                        <div className='flex items-center gap-2'>
                            <WandSparkles className='w-5 h-5 text-lucky-warning' />
                            <div>
                                <h2 className='type-title text-lucky-text-primary'>
                                    Criativaria Baseline
                                </h2>
                                <p className='type-meta text-lucky-text-tertiary'>
                                    Apply the migration baseline from legacy bots
                                    with safe reconcile defaults.
                                </p>
                            </div>
                        </div>
                        <Button
                            type='button'
                            onClick={handleApplyCriativariaPreset}
                            disabled={!canManageRbac || applyingCriativariaPreset}
                            className='gap-2'
                        >
                            {applyingCriativariaPreset ? (
                                <Loader2 className='w-4 h-4 animate-spin' />
                            ) : (
                                <WandSparkles className='w-4 h-4' />
                            )}
                            Apply Criativaria Baseline
                        </Button>
                    </div>
                </Card>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <Card className='p-5 space-y-5'>
                    <div className='flex items-center justify-between gap-4'>
                        <div className='flex items-center gap-2'>
                            <Shield className='w-5 h-5 text-lucky-text-secondary' />
                            <div>
                                <h2 className='type-title text-lucky-text-primary'>
                                    Access Control
                                </h2>
                                <p className='type-meta text-lucky-text-tertiary'>
                                    Assign role-based web dashboard permissions
                                </p>
                            </div>
                        </div>
                        {canManageRbac && (
                            <div className='flex items-center gap-2'>
                                <Button
                                    type='button'
                                    onClick={addRbacGrant}
                                    variant='secondary'
                                    className='gap-2'
                                    disabled={rbacLoading}
                                    title={
                                        !rbacLoading && rbacRoles.length === 0
                                            ? rbacRolesError ??
                                              'No assignable roles available right now.'
                                            : undefined
                                    }
                                >
                                    <Plus className='w-4 h-4' />
                                    Add Rule
                                </Button>
                                <Button
                                    type='button'
                                    onClick={handleSaveRbac}
                                    disabled={rbacSaving || rbacLoading}
                                    className='gap-2 bg-lucky-red hover:bg-lucky-red/90'
                                >
                                    {rbacSaving ? (
                                        <Loader2 className='w-4 h-4 animate-spin' />
                                    ) : (
                                        <Save className='w-4 h-4' />
                                    )}
                                    Save Policy
                                </Button>
                            </div>
                        )}
                    </div>

                    {rbacContent}
                </Card>
            </motion.div>
        </div>
    )
}
