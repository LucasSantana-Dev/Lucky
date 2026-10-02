import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { api } from '@/services/api'
import type {
    GuildChannelOption,
    GuildRoleOption,
    ModerationSettings,
} from '@/types'

interface FormState {
    modLogChannelId: string
    muteRoleId: string
    modRoleIds: string[]
    maxWarnings: string
    dmOnAction: boolean
}

const MAX_MOD_ROLES = 50

const SELECT_CLASS =
    'w-full rounded-md bg-lucky-bg-tertiary border border-lucky-border text-lucky-text-primary px-3 py-2 type-body-sm'

export default function ModerationSettingsForm({
    guildId,
}: {
    guildId: string
}) {
    const { t } = useTranslation('moderation')
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>(
        'idle',
    )
    const [channels, setChannels] = useState<GuildChannelOption[]>([])
    const [roles, setRoles] = useState<GuildRoleOption[]>([])
    const [form, setForm] = useState<FormState | null>(null)

    const [listErrors, setListErrors] = useState({
        channels: false,
        roles: false,
    })
    const [reloadKey, setReloadKey] = useState(0)
    const guildRef = useRef(guildId)
    guildRef.current = guildId

    const toForm = (s: ModerationSettings): FormState => ({
        modLogChannelId: s.modLogChannelId ?? '',
        muteRoleId: s.muteRoleId ?? '',
        modRoleIds: s.modRoleIds ?? [],
        maxWarnings: String(s.maxWarnings),
        dmOnAction: s.dmOnAction,
    })

    const retry = useCallback(() => setReloadKey((k) => k + 1), [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setLoadError(false)
        setSaveState('idle')
        setForm(null)
        Promise.allSettled([
            api.guilds.getChannels(guildId),
            api.guilds.getRoles(guildId),
            api.moderation.getSettings(guildId),
        ]).then(([ch, ro, se]) => {
            if (cancelled) return
            const chList =
                ch.status === 'fulfilled' ? ch.value?.data?.channels : undefined
            const roList =
                ro.status === 'fulfilled' ? ro.value?.data?.roles : undefined
            const settingsData =
                se.status === 'fulfilled' ? se.value?.data?.settings : undefined
            setChannels(chList ?? [])
            setRoles(roList ?? [])
            setListErrors({ channels: !chList, roles: !roList })
            if (settingsData) {
                setForm(toForm(settingsData))
            } else {
                setLoadError(true)
            }
            setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [guildId, reloadKey])

    const update = (patch: Partial<FormState>) => {
        setSaveState('idle')
        setForm((prev) => (prev ? { ...prev, ...patch } : prev))
    }

    const toggleRole = (id: string) => {
        if (!form) return
        update({
            modRoleIds: form.modRoleIds.includes(id)
                ? form.modRoleIds.filter((r) => r !== id)
                : [...form.modRoleIds, id],
        })
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        if (!form) return
        const requestGuild = guildId
        setSaving(true)
        setSaveState('idle')
        try {
            const res = await api.moderation.updateSettings(guildId, {
                modLogChannelId: form.modLogChannelId || null,
                muteRoleId: form.muteRoleId || null,
                modRoleIds: form.modRoleIds,
                maxWarnings: Math.min(
                    50,
                    Math.max(1, Number(form.maxWarnings) || 1),
                ),
                dmOnAction: form.dmOnAction,
            })
            if (guildRef.current !== requestGuild) return
            setForm(toForm(res.data.settings))
            setSaveState('saved')
        } catch {
            if (guildRef.current !== requestGuild) return
            setSaveState('error')
        } finally {
            setSaving(false)
        }
    }

    const roleChoices = form
        ? [
              ...roles,
              ...form.modRoleIds
                  .filter((id) => !roles.some((r) => r.id === id))
                  .map((id) => ({ id, name: id })),
          ]
        : roles

    if (loading) {
        return (
            <Card className='p-4 border border-lucky-border'>
                <div role='status' aria-label={t('settingsTitle')}>
                    <Skeleton className='h-4 w-40' />
                    <Skeleton className='h-9 w-full mt-3' />
                    <Skeleton className='h-9 w-full mt-3' />
                </div>
            </Card>
        )
    }

    if (loadError || !form) {
        return (
            <Card className='p-4 border border-lucky-border'>
                <p role='alert' className='type-body-sm text-red-400'>
                    {t('settingsLoadFailed')}
                </p>
                <Button type='button' onClick={retry} className='mt-3'>
                    {t('settingsRetry')}
                </Button>
            </Card>
        )
    }

    return (
        <Card className='p-4 border border-lucky-border'>
            <form onSubmit={handleSubmit} className='space-y-4'>
                <h2 className='type-title text-lucky-text-primary'>
                    {t('settingsTitle')}
                </h2>

                {(listErrors.channels || listErrors.roles) && (
                    <div role='alert' className='type-body-sm text-yellow-400'>
                        {listErrors.channels && (
                            <p>{t('settingsChannelsFailed')}</p>
                        )}
                        {listErrors.roles && <p>{t('settingsRolesFailed')}</p>}
                        <Button type='button' onClick={retry}>
                            {t('settingsRetry')}
                        </Button>
                    </div>
                )}

                <div className='grid gap-4 sm:grid-cols-2'>
                    <div className='space-y-1'>
                        <label
                            htmlFor='mod-settings-log-channel'
                            className='type-meta text-lucky-text-tertiary'
                        >
                            {t('settingsLogChannel')}
                        </label>
                        <select
                            id='mod-settings-log-channel'
                            className={SELECT_CLASS}
                            disabled={saving}
                            value={form.modLogChannelId}
                            onChange={(e) =>
                                update({ modLogChannelId: e.target.value })
                            }
                        >
                            <option value=''>{t('settingsNone')}</option>
                            {channels.map((c) => (
                                <option key={c.id} value={c.id}>
                                    #{c.name}
                                </option>
                            ))}
                            {form.modLogChannelId &&
                                !channels.some(
                                    (c) => c.id === form.modLogChannelId,
                                ) && (
                                    <option value={form.modLogChannelId}>
                                        {form.modLogChannelId}
                                    </option>
                                )}
                        </select>
                    </div>

                    <div className='space-y-1'>
                        <label
                            htmlFor='mod-settings-mute-role'
                            className='type-meta text-lucky-text-tertiary'
                        >
                            {t('settingsMuteRole')}
                        </label>
                        <select
                            id='mod-settings-mute-role'
                            className={SELECT_CLASS}
                            disabled={saving}
                            value={form.muteRoleId}
                            onChange={(e) =>
                                update({ muteRoleId: e.target.value })
                            }
                        >
                            <option value=''>{t('settingsNone')}</option>
                            {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                            {form.muteRoleId &&
                                !roles.some(
                                    (r) => r.id === form.muteRoleId,
                                ) && (
                                    <option value={form.muteRoleId}>
                                        {form.muteRoleId}
                                    </option>
                                )}
                        </select>
                    </div>

                    <div className='space-y-1'>
                        <label
                            htmlFor='mod-settings-max-warnings'
                            className='type-meta text-lucky-text-tertiary'
                        >
                            {t('settingsMaxWarnings')}
                        </label>
                        <input
                            id='mod-settings-max-warnings'
                            type='number'
                            min={1}
                            max={50}
                            className={SELECT_CLASS}
                            disabled={saving}
                            value={form.maxWarnings}
                            onChange={(e) =>
                                update({ maxWarnings: e.target.value })
                            }
                        />
                    </div>

                    <label className='flex items-center gap-2 type-body-sm text-lucky-text-primary self-end pb-2'>
                        <input
                            type='checkbox'
                            disabled={saving}
                            checked={form.dmOnAction}
                            onChange={(e) =>
                                update({ dmOnAction: e.target.checked })
                            }
                        />
                        {t('settingsDmOnAction')}
                    </label>
                </div>

                <fieldset className='space-y-2'>
                    <legend className='type-meta text-lucky-text-tertiary'>
                        {t('settingsModRoles')}
                    </legend>
                    <div className='flex flex-wrap gap-x-4 gap-y-2'>
                        {roleChoices.map((r) => (
                            <label
                                key={r.id}
                                className='flex items-center gap-2 type-body-sm text-lucky-text-primary'
                            >
                                <input
                                    type='checkbox'
                                    disabled={
                                        saving ||
                                        (!form.modRoleIds.includes(r.id) &&
                                            form.modRoleIds.length >=
                                                MAX_MOD_ROLES)
                                    }
                                    checked={form.modRoleIds.includes(r.id)}
                                    onChange={() => toggleRole(r.id)}
                                />
                                {r.name}
                            </label>
                        ))}
                    </div>
                    {form.modRoleIds.length >= MAX_MOD_ROLES && (
                        <p className='type-body-sm text-yellow-400'>
                            {t('settingsModRolesLimit', { max: MAX_MOD_ROLES })}
                        </p>
                    )}
                </fieldset>

                <div className='flex items-center gap-3'>
                    <Button type='submit' disabled={saving}>
                        {saving ? t('settingsSaving') : t('settingsSave')}
                    </Button>
                    {saveState === 'saved' && (
                        <p
                            role='status'
                            className='type-body-sm text-green-400'
                        >
                            {t('settingsSaved')}
                        </p>
                    )}
                    {saveState === 'error' && (
                        <p role='alert' className='type-body-sm text-red-400'>
                            {t('settingsSaveFailed')}
                        </p>
                    )}
                </div>
            </form>
        </Card>
    )
}
