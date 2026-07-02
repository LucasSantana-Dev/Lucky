import { reportError } from '@/lib/sentry'
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import Skeleton from '@/components/ui/Skeleton'
import EmojiPicker from '@/components/ui/EmojiPicker'
import { Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import { AddStyledRoleForm } from '@/components/reactionRoles/AddStyledRoleForm'
import type { RoleGroup } from '@/services/roleGroupsApi'
import type { ReactionRoleMessage } from '@/services/reactionRolesApi'

const BUTTON_STYLES = ['Primary', 'Secondary', 'Success', 'Danger'] as const

/** "0x5865F2" | "#5865F2" -> "#5865f2" for <input type="color">. */
function toHexInput(color?: string | null): string {
    if (!color) return '#5865f2'
    const hex = color.replace(/^0x/i, '').replace(/^#/, '')
    return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : '#5865f2'
}

/** "#5865f2" -> "0x5865F2" (storage format). */
function toStorageColor(hexInput: string): string {
    return `0x${hexInput.replace(/^#/, '').toUpperCase()}`
}

function RoleGroups() {
    const { t } = useTranslation('roleGroups')
    const { selectedGuild } = useGuildStore()
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<RoleGroup[]>([])
    const [messages, setMessages] = useState<ReactionRoleMessage[]>([])

    const load = useCallback(async () => {
        if (!selectedGuild) return
        try {
            const [groupList, messageList] = await Promise.all([
                api.roleGroups.list(selectedGuild.id),
                api.reactionRoles.list(selectedGuild.id),
            ])
            setGroups(groupList)
            setMessages(messageList)
        } catch (error) {
            reportError('Failed to load role groups:', error, {
                guildId: selectedGuild.id,
            })
            toast.error(t('loadError'))
        }
    }, [selectedGuild, t])

    useEffect(() => {
        if (!selectedGuild) {
            setLoading(false)
            return
        }
        let mounted = true
        setLoading(true)
        void (async () => {
            await load()
            if (mounted) setLoading(false)
        })()
        return () => {
            mounted = false
        }
    }, [selectedGuild, load])

    if (!selectedGuild) {
        return (
            <div className='flex-center min-h-[40vh] flex-col gap-2 text-center'>
                <h2 className='type-title text-lucky-text-primary'>
                    {t('noServerSelected')}
                </h2>
                <p className='type-body-sm text-lucky-text-tertiary'>
                    {t('selectServerToView')}
                </p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className='space-y-4' role='status' aria-live='polite'>
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className='h-40 w-full rounded-lg' />
                ))}
            </div>
        )
    }

    if (groups.length === 0) {
        return (
            <Card className='border border-lucky-border p-8 text-center'>
                <h2 className='type-title text-lucky-text-primary'>
                    {t('noGroupsYet')}
                </h2>
                <p className='type-body-sm text-lucky-text-tertiary mt-2'>
                    {t('noGroupsHint')}
                </p>
            </Card>
        )
    }

    return (
        <div className='space-y-4'>
            {groups.map((group) => (
                <RoleGroupCard
                    key={group.id}
                    group={group}
                    guildId={selectedGuild.id}
                    message={messages.find((m) => m.groupId === group.id)}
                    onChanged={load}
                />
            ))}
        </div>
    )
}

interface RoleGroupCardProps {
    group: RoleGroup
    guildId: string
    message?: ReactionRoleMessage
    onChanged: () => Promise<void>
}

function RoleGroupCard({
    group,
    guildId,
    message,
    onChanged,
}: RoleGroupCardProps) {
    const { t } = useTranslation('roleGroups')
    const [color, setColor] = useState(toHexInput(group.color))
    const [hoist, setHoist] = useState(group.hoist)
    const [mentionable, setMentionable] = useState(group.mentionable)
    const [buttonStyle, setButtonStyle] = useState(
        group.buttonStyle ?? 'Primary',
    )
    const [defaultEmoji, setDefaultEmoji] = useState(group.defaultEmoji ?? '')
    const [saving, setSaving] = useState(false)
    const [showAddRole, setShowAddRole] = useState(false)

    async function handleSave() {
        setSaving(true)
        try {
            await api.roleGroups.updateTemplate(guildId, group.id, {
                color: toStorageColor(color),
                hoist,
                mentionable,
                buttonStyle,
                defaultEmoji: defaultEmoji || null,
            })
            toast.success(t('saved'))
            await onChanged()
        } catch (error) {
            const message =
                error instanceof ApiError ? error.message : t('saveError')
            toast.error(message)
        } finally {
            setSaving(false)
        }
    }

    async function handleDetach(roleId: string) {
        try {
            await api.roleGroups.detachRole(guildId, group.id, roleId)
            toast.success(t('roleRemoved'))
            await onChanged()
        } catch (error) {
            const message =
                error instanceof ApiError ? error.message : t('removeError')
            toast.error(message)
        }
    }

    return (
        <Card className='border border-lucky-border p-6 space-y-5'>
            <div className='flex items-center gap-3 flex-wrap'>
                <span
                    className='inline-block w-4 h-4 rounded-full border border-lucky-border shrink-0'
                    style={{ backgroundColor: toHexInput(group.color) }}
                    aria-hidden
                />
                <h3 className='type-title text-lucky-text-primary'>
                    {group.name}
                </h3>
                {group.hoist && <Badge variant='outline'>{t('hoist')}</Badge>}
                {group.mentionable && (
                    <Badge variant='outline'>{t('mentionable')}</Badge>
                )}
                {message && (
                    <span className='type-body-sm text-lucky-text-tertiary ml-auto'>
                        {t('linkedPanel')}: {message.title ?? message.messageId}
                    </span>
                )}
            </div>

            <div>
                <p className='type-body-sm text-lucky-text-secondary mb-2'>
                    {t('rolesInGroup')}
                </p>
                {message && message.mappings.length > 0 ? (
                    <div className='flex flex-wrap gap-2'>
                        {message.mappings.map((m) => (
                            <span
                                key={m.roleId}
                                className='inline-flex items-center gap-1.5 rounded-md bg-lucky-bg-tertiary/50 px-2 py-1 text-xs text-lucky-text-secondary'
                            >
                                {m.emoji && <span>{m.emoji}</span>}
                                {m.label}
                                <button
                                    type='button'
                                    aria-label={t('removeRole')}
                                    onClick={() => void handleDetach(m.roleId)}
                                    className='text-lucky-text-tertiary hover:text-red-400 transition-colors'
                                >
                                    <X className='w-3 h-3' />
                                </button>
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className='type-body-sm text-lucky-text-tertiary'>
                        {t('noRolesInGroup')}
                    </p>
                )}
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-1.5'>
                    <Label htmlFor={`color-${group.id}`}>{t('color')}</Label>
                    <input
                        id={`color-${group.id}`}
                        type='color'
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className='h-9 w-16 rounded border border-lucky-border bg-transparent cursor-pointer'
                    />
                </div>
                <div className='space-y-1.5'>
                    <Label htmlFor={`style-${group.id}`}>
                        {t('buttonStyle')}
                    </Label>
                    <select
                        id={`style-${group.id}`}
                        value={buttonStyle}
                        onChange={(e) => setButtonStyle(e.target.value)}
                        className='h-9 w-full rounded-md border border-lucky-border bg-lucky-bg-tertiary/50 px-3 text-sm text-lucky-text-primary'
                    >
                        {BUTTON_STYLES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </div>
                <div className='flex items-center justify-between'>
                    <Label htmlFor={`hoist-${group.id}`}>{t('hoist')}</Label>
                    <Switch
                        id={`hoist-${group.id}`}
                        checked={hoist}
                        onCheckedChange={setHoist}
                    />
                </div>
                <div className='flex items-center justify-between'>
                    <Label htmlFor={`mention-${group.id}`}>
                        {t('mentionable')}
                    </Label>
                    <Switch
                        id={`mention-${group.id}`}
                        checked={mentionable}
                        onCheckedChange={setMentionable}
                    />
                </div>
                <div className='space-y-1.5 sm:col-span-2'>
                    <Label>{t('defaultEmoji')}</Label>
                    <EmojiPicker
                        value={defaultEmoji}
                        onChange={setDefaultEmoji}
                        guildId={guildId}
                    />
                </div>
            </div>

            <div className='flex items-center gap-2 flex-wrap'>
                <Button onClick={() => void handleSave()} disabled={saving}>
                    {saving ? t('saving') : t('save')}
                </Button>
                <Button
                    variant='secondary'
                    onClick={() => setShowAddRole((v) => !v)}
                >
                    {showAddRole ? (
                        <>
                            <Trash2 className='w-4 h-4 mr-1' />
                            {t('cancelAddRole')}
                        </>
                    ) : (
                        <>
                            <Plus className='w-4 h-4 mr-1' />
                            {t('addRole')}
                        </>
                    )}
                </Button>
            </div>

            {showAddRole && (
                <AddStyledRoleForm
                    guildId={guildId}
                    groupId={group.id}
                    onSuccess={() => {
                        setShowAddRole(false)
                        void onChanged()
                    }}
                />
            )}
        </Card>
    )
}

export default RoleGroups
