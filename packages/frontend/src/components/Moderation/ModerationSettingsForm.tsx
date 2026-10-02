import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { api } from '@/services/api'
import type { GuildChannelOption, GuildRoleOption } from '@/types'

interface FormState {
    modLogChannelId: string
    muteRoleId: string
    modRoleIds: string[]
    maxWarnings: string
    dmOnAction: boolean
}

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

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setLoadError(false)
        setSaveState('idle')
        Promise.all([
            api.guilds.getChannels(guildId),
            api.guilds.getRoles(guildId),
            api.moderation.getSettings(guildId),
        ])
            .then(([ch, ro, se]) => {
                if (cancelled) return
                const s = se.data.settings
                setChannels(ch.data.channels)
                setRoles(ro.data.roles)
                setForm({
                    modLogChannelId: s.modLogChannelId ?? '',
                    muteRoleId: s.muteRoleId ?? '',
                    modRoleIds: s.modRoleIds ?? [],
                    maxWarnings: String(s.maxWarnings),
                    dmOnAction: s.dmOnAction,
                })
            })
            .catch(() => {
                if (!cancelled) setLoadError(true)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [guildId])

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
        setSaving(true)
        setSaveState('idle')
        try {
            await api.moderation.updateSettings(guildId, {
                modLogChannelId: form.modLogChannelId || null,
                muteRoleId: form.muteRoleId || null,
                modRoleIds: form.modRoleIds,
                maxWarnings: Math.min(
                    50,
                    Math.max(1, Number(form.maxWarnings) || 1),
                ),
                dmOnAction: form.dmOnAction,
            })
            setSaveState('saved')
        } catch {
            setSaveState('error')
        } finally {
            setSaving(false)
        }
    }

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
            </Card>
        )
    }

    return (
        <Card className='p-4 border border-lucky-border'>
            <form onSubmit={handleSubmit} className='space-y-4'>
                <h2 className='type-title text-lucky-text-primary'>
                    {t('settingsTitle')}
                </h2>

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
                            value={form.maxWarnings}
                            onChange={(e) =>
                                update({ maxWarnings: e.target.value })
                            }
                        />
                    </div>

                    <label className='flex items-center gap-2 type-body-sm text-lucky-text-primary self-end pb-2'>
                        <input
                            type='checkbox'
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
                        {roles.map((r) => (
                            <label
                                key={r.id}
                                className='flex items-center gap-2 type-body-sm text-lucky-text-primary'
                            >
                                <input
                                    type='checkbox'
                                    checked={form.modRoleIds.includes(r.id)}
                                    onChange={() => toggleRole(r.id)}
                                />
                                {r.name}
                            </label>
                        ))}
                    </div>
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
