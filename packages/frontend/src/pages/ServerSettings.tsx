import { reportError } from '@/lib/sentry'
import {
    useState,
    useEffect,
    useCallback,
    useRef,
    type ReactElement,
} from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
    Settings,
    Save,
    Loader2,
    Hash,
    Globe,
    Palette,
    Volume2,
    ListMusic,
    Timer,
    Percent,
    Music,
    AlertTriangle,
    Plus,
    Trash2,
    Shield,
    RotateCcw,
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
import SectionHeader from '@/components/ui/SectionHeader'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import { SUPPORTED_BOT_LANGUAGES } from '@lucky/shared/constants'
import { RBAC_MODULES, type RoleGrant, type ServerSettings } from '@/types'

type SettingsLoadErrorKind = 'auth' | 'forbidden' | 'network' | 'upstream'

type SettingsLoadError = {
    kind: SettingsLoadErrorKind
    message: string
}

const DEFAULT_SETTINGS: ServerSettings = {
    prefix: '/',
    embedColor: '0x5865F2',
    language: 'en',
    allowPlaylists: true,
    allowSpotify: true,
    commandCooldown: 3,
    maxQueueSize: 100,
    defaultVolume: 50,
    voteSkipThreshold: 50,
}

function classifySettingsLoadError(
    error: unknown,
    t: (key: string) => string,
): SettingsLoadError {
    if (error instanceof ApiError) {
        if (error.status === 401) {
            return {
                kind: 'auth',
                message: t('serverSettings.sessionExpired'),
            }
        }

        if (error.status === 403) {
            return {
                kind: 'forbidden',
                message: t('serverSettings.accessDenied'),
            }
        }

        if (error.status === 0) {
            return {
                kind: 'network',
                message: t('serverSettings.networkError'),
            }
        }

        return {
            kind: 'upstream',
            message: error.message || t('serverSettings.unableToLoadMessage'),
        }
    }

    if (error instanceof Error) {
        return { kind: 'upstream', message: error.message }
    }

    return {
        kind: 'upstream',
        message: t('serverSettings.unableToLoadMessage'),
    }
}

export default function ServerSettingsPage() {
    const { t } = useTranslation()
    const { selectedGuild, memberContext } = useGuildStore()
    const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)
    const [settingsLoadError, setSettingsLoadError] =
        useState<SettingsLoadError | null>(null)
    const [saving, setSaving] = useState(false)
    const [rbacLoading, setRbacLoading] = useState(false)
    const [rbacSaving, setRbacSaving] = useState(false)
    const [rbacRolesError, setRbacRolesError] = useState<string | null>(null)
    const [rbacRoles, setRbacRoles] = useState<
        Array<{ id: string; name: string }>
    >([])
    const [rbacGrants, setRbacGrants] = useState<RoleGrant[]>([])
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
                setRbacRolesError(t('serverSettings.noAssignableRoles'))
            }
        } catch (error) {
            reportError('Failed to load server roles:', error, {
                component: 'ServerSettings',
                action: 'loadRbacRoles',
            })
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
            setSettingsLoadError(classifySettingsLoadError(error, t))
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
            toast.success(t('serverSettings.settingsSaved'))
        } catch {
            toast.error(t('serverSettings.settingsSaveFailed'))
        } finally {
            setSaving(false)
        }
    }

    const addRbacGrant = () => {
        if (rbacLoading) {
            toast.error(t('serverSettings.stillLoadingRoles'))
            return
        }

        if (rbacRoles.length === 0) {
            toast.error(
                rbacRolesError ?? t('serverSettings.roleOptionsNotAvailable'),
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
            toast.success(t('serverSettings.accessControlSaved'))
        } catch {
            toast.error(t('serverSettings.accessControlFailed'))
        } finally {
            setRbacSaving(false)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Settings className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    {t('serverSettings.noServerSelected')}
                </h2>
                <p className='type-body text-lucky-text-secondary'>
                    {t('serverSettings.selectServerDescription')}
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
                        {t('serverSettings.title')}
                    </h1>
                    <p className='type-body text-lucky-text-secondary mt-1'>
                        {t('serverSettings.description', {
                            name: selectedGuild.name,
                        })}
                    </p>
                </header>
                <Card className='p-5 space-y-4'>
                    <div className='flex items-center gap-2 text-lucky-yellow'>
                        <AlertTriangle className='w-5 h-5' />
                        <h2 className='type-title text-lucky-text-primary'>
                            {t('serverSettings.unableToLoadTitle')}
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
                            {t('serverSettings.retryButtonLabel')}
                        </Button>
                        {(settingsLoadError.kind === 'auth' ||
                            settingsLoadError.kind === 'forbidden') && (
                            <a
                                href={api.auth.getDiscordLoginUrl()}
                                className='type-body-sm text-lucky-text-secondary hover:text-lucky-text-primary'
                            >
                                {t('serverSettings.reAuthenticateLink')}
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
                    {t('serverSettings.rbacCannotManage')}
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
                                    {t('serverSettings.retryRoles')}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
                {rbacGrants.length === 0 ? (
                    <p className='type-body-sm text-lucky-text-tertiary'>
                        {t('serverSettings.noRbacRules')}
                    </p>
                ) : (
                    rbacGrants.map((grant, index) => (
                        <div
                            key={`${grant.roleId}:${grant.module}:${grant.mode}:${index}`}
                            className='surface-card grid grid-cols-1 gap-3 p-4 md:grid-cols-[1.5fr_1.2fr_1fr_48px]'
                        >
                            <Select
                                value={grant.roleId}
                                onValueChange={(value: string) =>
                                    updateRbacGrant(index, {
                                        roleId: value,
                                    })
                                }
                            >
                                <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border/60 text-lucky-text-primary text-sm'>
                                    <SelectValue
                                        placeholder={t(
                                            'serverSettings.roleSelectPlaceholder',
                                        )}
                                    />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    {rbacRoles.map((role) => (
                                        <SelectItem
                                            key={role.id}
                                            value={role.id}
                                        >
                                            {role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={grant.module}
                                onValueChange={(value: string) =>
                                    updateRbacGrant(index, {
                                        module: value as RoleGrant['module'],
                                    })
                                }
                            >
                                <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border/60 text-lucky-text-primary text-sm'>
                                    <SelectValue
                                        placeholder={t(
                                            'serverSettings.moduleSelectPlaceholder',
                                        )}
                                    />
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
                                onValueChange={(value: string) =>
                                    updateRbacGrant(index, {
                                        mode: value as RoleGrant['mode'],
                                    })
                                }
                            >
                                <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border/60 text-lucky-text-primary text-sm'>
                                    <SelectValue
                                        placeholder={t(
                                            'serverSettings.modeSelectPlaceholder',
                                        )}
                                    />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    <SelectItem value='view'>
                                        {t('serverSettings.modeView')}
                                    </SelectItem>
                                    <SelectItem value='manage'>
                                        {t('serverSettings.modeManage')}
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                className='text-lucky-text-tertiary hover:text-lucky-error hover:bg-lucky-error/10 transition-colors'
                                onClick={() => removeRbacGrant(index)}
                                title={t('serverSettings.removeRuleTitle')}
                            >
                                <Trash2 className='w-4 h-4' />
                            </Button>
                        </div>
                    ))
                )}
            </div>
        )
    }

    return (
        <div className='space-y-6 lg:pb-0 pb-24'>
            <SectionHeader
                eyebrow={t('serverSettings.eyebrow')}
                title={t('serverSettings.title')}
                description={t('serverSettings.description', {
                    name: selectedGuild.name,
                })}
                actions={
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className='gap-2'
                    >
                        {saving ? (
                            <Loader2 className='w-4 h-4 animate-spin' />
                        ) : (
                            <Save className='w-4 h-4' />
                        )}
                        {t('serverSettings.saveChanges')}
                    </Button>
                }
            />

            {/* General Settings */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0 }}
            >
                <Card className='p-5 space-y-5 border border-lucky-border'>
                    <div className='flex items-center gap-2'>
                        <Settings className='w-5 h-5 text-lucky-text-secondary' />
                        <h2 className='type-title text-lucky-text-primary'>
                            {t('serverSettings.general')}
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Hash className='w-3 h-3' />{' '}
                                {t('serverSettings.commandPrefix')}
                            </Label>
                            <Input
                                value={settings.prefix}
                                onChange={(e) =>
                                    update('prefix', e.target.value)
                                }
                                placeholder={t(
                                    'serverSettings.commandPrefixPlaceholder',
                                )}
                                maxLength={5}
                                className='bg-lucky-bg-tertiary border-lucky-border text-white w-24'
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Palette className='w-3 h-3' />{' '}
                                {t('serverSettings.embedColor')}
                            </Label>
                            <Input
                                value={settings.embedColor}
                                onChange={(e) =>
                                    update('embedColor', e.target.value)
                                }
                                placeholder={t(
                                    'serverSettings.embedColorPlaceholder',
                                )}
                                maxLength={8}
                                className='bg-lucky-bg-tertiary border-lucky-border text-white'
                            />
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Language */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
            >
                <Card className='p-5 space-y-5 border border-lucky-border'>
                    <div className='flex items-center gap-2'>
                        <Globe className='w-5 h-5 text-lucky-text-secondary' />
                        <h2 className='type-title text-lucky-text-primary'>
                            {t('serverSettings.language')}
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Select
                                value={settings.language}
                                onValueChange={(v: string) =>
                                    update('language', v)
                                }
                            >
                                <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border text-white'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    {SUPPORTED_BOT_LANGUAGES.map((lang) => (
                                        <SelectItem key={lang} value={lang}>
                                            {lang}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Music Defaults */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
            >
                <Card className='p-5 space-y-5 border border-lucky-border'>
                    <div className='flex items-center gap-2'>
                        <Music className='w-5 h-5 text-lucky-text-secondary' />
                        <h2 className='type-title text-lucky-text-primary'>
                            {t('serverSettings.musicDefaults')}
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Volume2 className='w-3 h-3' />{' '}
                                {t('serverSettings.defaultVolume')}
                            </Label>
                            <Input
                                type='number'
                                min={1}
                                max={200}
                                value={settings.defaultVolume}
                                onChange={(e) =>
                                    update(
                                        'defaultVolume',
                                        Number(e.target.value),
                                    )
                                }
                                className='bg-lucky-bg-tertiary border-lucky-border text-white'
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <ListMusic className='w-3 h-3' />{' '}
                                {t('serverSettings.maxQueueSize')}
                            </Label>
                            <Input
                                type='number'
                                min={1}
                                max={1000}
                                value={settings.maxQueueSize}
                                onChange={(e) =>
                                    update(
                                        'maxQueueSize',
                                        Number(e.target.value),
                                    )
                                }
                                className='bg-lucky-bg-tertiary border-lucky-border text-white'
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Timer className='w-3 h-3' />{' '}
                                {t('serverSettings.commandCooldown')}
                            </Label>
                            <Input
                                type='number'
                                min={0}
                                max={300}
                                value={settings.commandCooldown}
                                onChange={(e) =>
                                    update(
                                        'commandCooldown',
                                        Number(e.target.value),
                                    )
                                }
                                className='bg-lucky-bg-tertiary border-lucky-border text-white'
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Percent className='w-3 h-3' />{' '}
                                {t('serverSettings.voteSkipThreshold')}
                            </Label>
                            <Input
                                type='number'
                                min={1}
                                max={100}
                                value={settings.voteSkipThreshold}
                                onChange={(e) =>
                                    update(
                                        'voteSkipThreshold',
                                        Number(e.target.value),
                                    )
                                }
                                className='bg-lucky-bg-tertiary border-lucky-border text-white'
                            />
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Permissions */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <Card className='p-5 space-y-4 border border-lucky-border'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2 rounded-lg bg-lucky-brand/15'>
                                <ListMusic className='w-4 h-4 text-lucky-brand' />
                            </div>
                            <div>
                                <h3 className='type-body-sm font-semibold text-lucky-text-primary'>
                                    {t('serverSettings.allowPlaylists')}
                                </h3>
                                <p className='type-meta text-lucky-text-tertiary mt-0.5 uppercase tracking-wide font-semibold'>
                                    {t(
                                        'serverSettings.allowPlaylistsDescription',
                                    )}
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.allowPlaylists}
                            onCheckedChange={(v: boolean) =>
                                update('allowPlaylists', v)
                            }
                        />
                    </div>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2 rounded-lg bg-lucky-brand/15'>
                                <Music className='w-4 h-4 text-lucky-brand' />
                            </div>
                            <div>
                                <h3 className='type-body-sm font-semibold text-lucky-text-primary'>
                                    {t('serverSettings.allowSpotify')}
                                </h3>
                                <p className='type-meta text-lucky-text-tertiary mt-0.5 uppercase tracking-wide font-semibold'>
                                    {t(
                                        'serverSettings.allowSpotifyDescription',
                                    )}
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.allowSpotify}
                            onCheckedChange={(v: boolean) =>
                                update('allowSpotify', v)
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
                    {t('serverSettings.saveChanges')}
                </Button>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <Card className='p-5 space-y-5 border border-lucky-border'>
                    <div className='flex items-center justify-between gap-4'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2 rounded-lg bg-lucky-brand/10'>
                                <Shield className='w-5 h-5 text-lucky-brand' />
                            </div>
                            <div>
                                <h2 className='type-title text-lucky-text-primary'>
                                    {t('serverSettings.accessControl')}
                                </h2>
                                <p className='type-body-sm text-lucky-text-tertiary mt-0.5 uppercase tracking-wide font-semibold'>
                                    {t(
                                        'serverSettings.accessControlDescription',
                                    )}
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
                                            ? (rbacRolesError ??
                                              t(
                                                  'serverSettings.noAssignableRoles',
                                              ))
                                            : undefined
                                    }
                                >
                                    <Plus className='w-4 h-4' />
                                    {t('serverSettings.addRuleLabel')}
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
                                    {t('serverSettings.saveAccessControl')}
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
