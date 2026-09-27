import { useEffect, useMemo, useRef, useState } from 'react'
import {
    Search,
    X,
    Code,
    ChevronDown,
    Plus,
    Pencil,
    Trash2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import Skeleton from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import { hasModuleAccess } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import type { Command } from '@/types'
import { useTranslation } from 'react-i18next'

// Mirrors packages/backend/src/schemas/management.ts createCommandBody /
// updateCommandBody so invalid input never reaches the API (#2408). Plain
// checks (not zod) to avoid pulling the vendor-forms bundle into this route.
const NAME_REGEX = /^[\w-]+$/
const isValidCommandName = (name: string) =>
    name.length > 0 && name.length <= 32 && NAME_REGEX.test(name)
const isValidCommandDescription = (description: string) =>
    description.length <= 100

interface CommandFormState {
    name: string
    response: string
    description: string
}

const EMPTY_FORM: CommandFormState = { name: '', response: '', description: '' }

function CommandFormModal({
    command,
    onClose,
    onSave,
}: {
    command: Command | null
    onClose: () => void
    onSave: (form: CommandFormState) => Promise<void>
}) {
    const { t } = useTranslation()
    const isEdit = command !== null
    const [form, setForm] = useState<CommandFormState>(() =>
        command
            ? {
                  name: command.name,
                  response: command.response ?? '',
                  description: command.description ?? '',
              }
            : EMPTY_FORM,
    )
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const nameInputRef = useRef<HTMLInputElement>(null)
    const responseInputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        ;(isEdit ? responseInputRef.current : nameInputRef.current)?.focus()
    }, [isEdit])

    const handleSave = async () => {
        if (!isEdit && !isValidCommandName(form.name)) {
            setError(t('customCommands.nameInvalid'))
            return
        }
        if (form.response.length === 0) {
            setError(t('customCommands.responseRequired'))
            return
        }
        if (form.response.length > 2000) {
            setError(t('customCommands.responseTooLong'))
            return
        }
        if (!isValidCommandDescription(form.description)) {
            setError(t('customCommands.descriptionTooLong'))
            return
        }

        setSaving(true)
        setError(null)
        try {
            await onSave(form)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
            onKeyDown={(e) => {
                if (e.key === 'Escape') onClose()
            }}
        >
            <div
                role='dialog'
                aria-modal='true'
                aria-labelledby='command-form-title'
                className='surface-card w-full max-w-lg rounded-xl p-5 space-y-4'
            >
                <h2
                    id='command-form-title'
                    className='type-title text-lucky-text-primary'
                >
                    {isEdit
                        ? t('customCommands.editCommandTitle')
                        : t('customCommands.newCommandTitle')}
                </h2>

                {error && (
                    <p className='text-red-400 type-body-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2'>
                        {error}
                    </p>
                )}

                <div className='space-y-1.5'>
                    <Label
                        htmlFor='cmd-name'
                        className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold'
                    >
                        {t('customCommands.name')}
                    </Label>
                    <Input
                        id='cmd-name'
                        ref={nameInputRef}
                        value={form.name}
                        disabled={isEdit}
                        placeholder={t('customCommands.namePlaceholder')}
                        onChange={(e) =>
                            setForm((prev) => ({
                                ...prev,
                                name: e.target.value,
                            }))
                        }
                        className='bg-lucky-bg-tertiary border-lucky-border'
                    />
                </div>

                <div className='space-y-1.5'>
                    <Label
                        htmlFor='cmd-response'
                        className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold'
                    >
                        {t('customCommands.response')}
                    </Label>
                    <textarea
                        id='cmd-response'
                        ref={responseInputRef}
                        value={form.response}
                        placeholder={t('customCommands.responsePlaceholder')}
                        onChange={(e) =>
                            setForm((prev) => ({
                                ...prev,
                                response: e.target.value,
                            }))
                        }
                        rows={3}
                        className='w-full bg-lucky-bg-tertiary border border-lucky-border rounded-md px-3 py-2 type-body-sm text-lucky-text-primary resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                    />
                </div>

                <div className='space-y-1.5'>
                    <Label
                        htmlFor='cmd-description'
                        className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold'
                    >
                        {t('customCommands.description')}
                    </Label>
                    <Input
                        id='cmd-description'
                        value={form.description}
                        placeholder={t('customCommands.descriptionPlaceholder')}
                        onChange={(e) =>
                            setForm((prev) => ({
                                ...prev,
                                description: e.target.value,
                            }))
                        }
                        className='bg-lucky-bg-tertiary border-lucky-border'
                    />
                </div>

                <div className='flex justify-end gap-3 pt-2'>
                    <Button variant='secondary' onClick={onClose}>
                        {t('customCommands.cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving
                            ? t('customCommands.saving')
                            : isEdit
                              ? t('customCommands.saveChanges')
                              : t('customCommands.create')}
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default function CustomCommandsPage() {
    const { t } = useTranslation()
    const { selectedGuild, memberContext } = useGuildStore()
    const [commands, setCommands] = useState<Command[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [expandedCommand, setExpandedCommand] = useState<string | null>(null)
    const [modalCommand, setModalCommand] = useState<
        Command | null | undefined
    >(undefined)
    const [deleteTarget, setDeleteTarget] = useState<Command | null>(null)

    const effectiveAccess =
        memberContext?.effectiveAccess ?? selectedGuild?.effectiveAccess
    const canManage = hasModuleAccess(effectiveAccess, 'automation', 'manage')

    useEffect(() => {
        const guildId = selectedGuild?.id
        if (!guildId) return
        let stale = false
        setLoading(true)
        api.commands
            .list(guildId)
            .then((res) => {
                if (!stale) setCommands(res.data.commands)
            })
            .catch(() => {
                if (!stale) setCommands([])
            })
            .finally(() => {
                if (!stale) setLoading(false)
            })
        return () => {
            stale = true
        }
    }, [selectedGuild?.id])

    const filtered = useMemo(() => {
        return commands.filter((cmd) => {
            if (!searchQuery) return true
            const q = searchQuery.toLowerCase()
            return (
                cmd.name.toLowerCase().includes(q) ||
                (cmd.description ?? '').toLowerCase().includes(q)
            )
        })
    }, [commands, searchQuery])

    const handleToggle = async (cmd: Command) => {
        try {
            await api.commands.toggle(selectedGuild!.id, cmd.name, !cmd.enabled)
            setCommands((prev) =>
                prev.map((c) =>
                    c.id === cmd.id ? { ...c, enabled: !c.enabled } : c,
                ),
            )
            toast.success(
                t(
                    cmd.enabled
                        ? 'customCommands.toggleDisabled'
                        : 'customCommands.toggleEnabled',
                    { name: cmd.name },
                ),
            )
        } catch {
            toast.error(t('customCommands.toggleError'))
        }
    }

    const handleCreateOrUpdate = async (form: CommandFormState) => {
        if (!selectedGuild) return
        if (modalCommand) {
            // Editing: send the description as typed (including '') so
            // clearing it actually clears it server-side, instead of the
            // key being dropped and the old value silently surviving.
            const res = await api.commands.update(
                selectedGuild.id,
                modalCommand.name,
                {
                    response: form.response,
                    description: form.description,
                },
            )
            setCommands((prev) =>
                prev.map((c) => (c.id === modalCommand.id ? res.data : c)),
            )
            toast.success(
                t('customCommands.updateSuccess', { name: modalCommand.name }),
            )
        } else {
            const res = await api.commands.create(selectedGuild.id, {
                name: form.name,
                response: form.response,
                description: form.description || undefined,
            })
            setCommands((prev) => {
                // POST /commands is idempotent on (guildId, name): a
                // case-insensitive name collision returns the existing row
                // with 200, so only append when it isn't already in state
                // (otherwise we'd render a duplicate row with a duplicate key).
                const exists = prev.some((c) => c.id === res.data.id)
                return exists
                    ? prev.map((c) => (c.id === res.data.id ? res.data : c))
                    : [...prev, res.data]
            })
            toast.success(
                t('customCommands.createSuccess', { name: form.name }),
            )
        }
    }

    const handleDelete = async () => {
        if (!selectedGuild || !deleteTarget) return
        try {
            await api.commands.delete(selectedGuild.id, deleteTarget.name)
            setCommands((prev) => prev.filter((c) => c.id !== deleteTarget.id))
            toast.success(
                t('customCommands.deleteSuccess', { name: deleteTarget.name }),
            )
        } catch {
            toast.error(t('customCommands.deleteError'))
        } finally {
            setDeleteTarget(null)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Code className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    {t('customCommands.noServerSelected')}
                </h2>
                <p className='text-lucky-text-secondary text-sm'>
                    {t('customCommands.selectServerToManage')}
                </p>
            </div>
        )
    }

    const isModalOpen = modalCommand !== undefined

    return (
        <div className='space-y-6'>
            <header className='flex items-center justify-between gap-4'>
                <div>
                    <h1 className='type-h1 text-lucky-text-primary'>
                        {t('customCommands.title')}
                    </h1>
                    <p className='text-sm text-lucky-text-secondary mt-1'>
                        {t('customCommands.subtitle', {
                            name: selectedGuild.name,
                        })}
                    </p>
                </div>
                {canManage && (
                    <Button onClick={() => setModalCommand(null)}>
                        <Plus className='h-4 w-4 mr-2' />
                        {t('customCommands.newCommand')}
                    </Button>
                )}
            </header>

            <div className='surface-panel rounded-lg p-4 space-y-3 border border-lucky-border'>
                <div className='relative'>
                    <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lucky-text-tertiary' />
                    <Input
                        placeholder={t(
                            'customCommands.searchCommandsPlaceholder',
                        )}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='pl-9 bg-lucky-bg-tertiary border-lucky-border text-lucky-text-primary placeholder:text-lucky-text-tertiary'
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className='absolute right-3 top-1/2 -translate-y-1/2 text-lucky-text-tertiary hover:text-lucky-text-primary transition-colors'
                        >
                            <X className='w-4 h-4' />
                        </button>
                    )}
                </div>
            </div>

            <div className='space-y-1'>
                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className='surface-panel rounded-lg p-4 border border-lucky-border flex items-center gap-3'
                        >
                            <Skeleton className='w-8 h-8 rounded' />
                            <div className='flex-1'>
                                <Skeleton className='h-4 w-40 mb-2' />
                                <Skeleton className='h-3 w-60' />
                            </div>
                            <Skeleton className='w-10 h-6 rounded' />
                        </div>
                    ))
                ) : filtered.length > 0 ? (
                    filtered.map((cmd) => (
                        <div
                            key={cmd.id}
                            className={cn(
                                'surface-panel rounded-lg border border-lucky-border transition-all',
                                !cmd.enabled && 'opacity-60',
                            )}
                        >
                            <div className='w-full px-4 py-3 flex items-center gap-3'>
                                <button
                                    type='button'
                                    onClick={() =>
                                        setExpandedCommand(
                                            expandedCommand === cmd.id
                                                ? null
                                                : cmd.id,
                                        )
                                    }
                                    aria-expanded={expandedCommand === cmd.id}
                                    className='flex-1 min-w-0 flex items-center gap-3 text-left transition-colors hover:bg-lucky-bg-active/25 rounded'
                                >
                                    <div className='p-2 rounded bg-lucky-bg-active shrink-0'>
                                        <Code className='w-4 h-4 text-lucky-text-secondary' />
                                    </div>
                                    <div className='flex-1 min-w-0 text-left'>
                                        <h3 className='type-body-sm font-semibold text-lucky-text-primary truncate'>
                                            /{cmd.name}
                                        </h3>
                                        <p className='text-xs text-lucky-text-tertiary line-clamp-1'>
                                            {cmd.description}
                                        </p>
                                    </div>
                                    <ChevronDown
                                        className={cn(
                                            'w-4 h-4 text-lucky-text-tertiary transition-transform shrink-0',
                                            expandedCommand === cmd.id &&
                                                'rotate-180',
                                        )}
                                    />
                                </button>
                                <div className='flex items-center gap-2 shrink-0'>
                                    <Switch
                                        checked={cmd.enabled}
                                        disabled={!canManage}
                                        onCheckedChange={() =>
                                            handleToggle(cmd)
                                        }
                                        aria-label={t(
                                            'customCommands.toggleAriaLabel',
                                            { name: cmd.name },
                                        )}
                                    />
                                    {canManage && (
                                        <>
                                            <button
                                                type='button'
                                                onClick={() =>
                                                    setModalCommand(cmd)
                                                }
                                                className='flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-lucky-text-secondary hover:text-lucky-brand hover:bg-lucky-bg-active/50 transition-colors'
                                                aria-label={t(
                                                    'customCommands.editAriaLabel',
                                                    { name: cmd.name },
                                                )}
                                            >
                                                <Pencil className='h-4 w-4' />
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() =>
                                                    setDeleteTarget(cmd)
                                                }
                                                className='flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-lucky-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors'
                                                aria-label={t(
                                                    'customCommands.deleteAriaLabel',
                                                    { name: cmd.name },
                                                )}
                                            >
                                                <Trash2 className='h-4 w-4' />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {expandedCommand === cmd.id && (
                                <div className='border-t border-lucky-border px-4 py-3 bg-lucky-bg-tertiary/30 text-xs text-lucky-text-secondary space-y-2'>
                                    <div>
                                        <p className='font-medium text-lucky-text-primary mb-1'>
                                            {t('customCommands.description')}
                                        </p>
                                        <p>{cmd.description}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className='surface-panel rounded-lg p-12 border border-lucky-border text-center'>
                        <Code className='w-12 h-12 text-lucky-text-tertiary mx-auto mb-3' />
                        <p className='text-sm text-lucky-text-secondary mb-1'>
                            {t('customCommands.noCommandsFound')}
                        </p>
                        <p className='text-xs text-lucky-text-tertiary'>
                            {searchQuery
                                ? t('customCommands.tryAdjustingFilters')
                                : t('customCommands.commandsWillAppearHere')}
                        </p>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <CommandFormModal
                    command={modalCommand ?? null}
                    onClose={() => setModalCommand(undefined)}
                    onSave={handleCreateOrUpdate}
                />
            )}

            {deleteTarget && (
                <div
                    className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setDeleteTarget(null)
                    }}
                >
                    <div
                        role='dialog'
                        aria-modal='true'
                        aria-labelledby='delete-command-title'
                        className='surface-card rounded-xl p-6 max-w-sm w-full space-y-4'
                    >
                        <h3
                            id='delete-command-title'
                            className='type-title text-lucky-text-primary'
                        >
                            {t('customCommands.deleteCommand')}
                        </h3>
                        <p className='type-body-sm text-lucky-text-secondary'>
                            {t('customCommands.deleteCommandConfirm', {
                                name: deleteTarget.name,
                            })}
                        </p>
                        <div className='flex gap-3 justify-end'>
                            <Button
                                variant='secondary'
                                autoFocus
                                onClick={() => setDeleteTarget(null)}
                            >
                                {t('customCommands.cancel')}
                            </Button>
                            <Button
                                variant='destructive'
                                onClick={() => void handleDelete()}
                            >
                                {t('customCommands.delete')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
