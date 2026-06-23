import { useCallback, useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Users,
    Hash,
    MessageSquare,
    Sparkles,
    Plus,
    Trash2,
    X,
    Pencil,
    Download,
    Upload,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AutoGrowTextarea from '@/components/ui/AutoGrowTextarea'
import FormattingToolbar from '@/components/ui/FormattingToolbar'
import EmojiPicker from '@/components/ui/EmojiPicker'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import type {
    ReactionRoleMessage,
    CreateReactionRoleEntry,
} from '@/services/reactionRolesApi'
import type { GuildRoleOption } from '@/types/rbac'
import type { GuildChannelOption } from '@/types/guild'
import { serializeReactionRolesToJSON } from '@/utils/reactionRolesExport'
import { ImportDialog } from '@/components/reactionRoles/ImportDialog'

const BUTTON_STYLE_LABELS: Record<string, string> = {
    '1': 'Primary',
    '2': 'Secondary',
    '3': 'Success',
    '4': 'Danger',
    '5': 'Link',
    Primary: 'Primary',
    Secondary: 'Secondary',
    Success: 'Success',
    Danger: 'Danger',
    Link: 'Link',
}

const BUTTON_STYLE_COLORS: Record<string, string> = {
    '1': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    '2': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    '3': 'bg-green-500/15 text-green-400 border-green-500/30',
    '4': 'bg-red-500/15 text-red-400 border-red-500/30',
    '5': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    Primary: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Secondary: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    Success: 'bg-green-500/15 text-green-400 border-green-500/30',
    Danger: 'bg-red-500/15 text-red-400 border-red-500/30',
    Link: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

const BUTTON_STYLES = ['Primary', 'Secondary', 'Success', 'Danger'] as const

function MappingPill({
    emoji,
    label,
    style,
    roleId,
}: {
    emoji: string | null
    label: string
    style: string
    roleId: string
}) {
    const styleLabel = BUTTON_STYLE_LABELS[style] ?? style
    const styleColor =
        BUTTON_STYLE_COLORS[style] ??
        'bg-purple-500/15 text-purple-400 border-purple-500/30'
    return (
        <div className='flex items-center gap-2 rounded-lg border border-lucky-border bg-lucky-bg-tertiary/50 px-3 py-2'>
            {emoji && (
                <span className='shrink-0 text-base leading-none'>{emoji}</span>
            )}
            <span className='type-body-sm truncate font-medium text-lucky-text-primary'>
                {label}
            </span>
            <span
                className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styleColor}`}
            >
                {styleLabel}
            </span>
            <code className='type-body-sm shrink-0 rounded bg-lucky-bg-active/60 px-1.5 py-0.5 font-mono text-[11px] text-lucky-text-secondary'>
                {roleId}
            </code>
        </div>
    )
}

function MessageCard({
    message,
    onDelete,
    onEdit,
}: {
    message: ReactionRoleMessage
    onDelete: (messageId: string) => Promise<void>
    onEdit: (message: ReactionRoleMessage) => void
}) {
    const [deleting, setDeleting] = useState(false)
    const date = new Date(message.createdAt)
    const dateStr = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })

    async function handleDelete() {
        setDeleting(true)
        try {
            await onDelete(message.messageId)
        } finally {
            setDeleting(false)
        }
    }

    return (
        <Card className='space-y-4 p-5'>
            <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                        <MessageSquare className='h-4 w-4 shrink-0 text-lucky-accent' />
                        <code className='type-body-sm truncate font-mono text-lucky-text-secondary'>
                            {message.messageId}
                        </code>
                    </div>
                    <div className='mt-1 flex items-center gap-3 text-lucky-text-tertiary'>
                        <span className='flex items-center gap-1'>
                            <Hash className='h-3.5 w-3.5' />
                            <code className='type-body-sm font-mono'>
                                {message.channelId}
                            </code>
                        </span>
                        <span className='type-body-sm'>·</span>
                        <span className='type-body-sm'>{dateStr}</span>
                    </div>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                    <Badge variant='secondary'>
                        {message.mappings.length}{' '}
                        {message.mappings.length === 1 ? 'role' : 'roles'}
                    </Badge>
                    <Button
                        variant='secondary'
                        size='sm'
                        aria-label='Edit'
                        onClick={() => onEdit(message)}
                        className='text-lucky-text-secondary'
                    >
                        <Pencil className='h-3.5 w-3.5' />
                    </Button>
                    <Button
                        variant='secondary'
                        size='sm'
                        aria-label='Delete'
                        onClick={() => void handleDelete()}
                        disabled={deleting}
                        className='text-lucky-error hover:border-lucky-error/40 hover:bg-lucky-error/10'
                    >
                        <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                </div>
            </div>

            {message.mappings.length > 0 ? (
                <div className='space-y-2'>
                    {message.mappings.map((mapping) => (
                        <MappingPill
                            key={mapping.id}
                            emoji={mapping.emoji}
                            label={mapping.label}
                            style={mapping.style}
                            roleId={mapping.roleId}
                        />
                    ))}
                </div>
            ) : (
                <p className='type-body-sm text-lucky-text-tertiary'>
                    No role mappings found for this message.
                </p>
            )}
        </Card>
    )
}

function SkeletonCard() {
    return (
        <Card className='space-y-4 p-5'>
            <div className='flex items-start justify-between gap-3'>
                <div className='flex-1 space-y-2'>
                    <Skeleton className='h-4 w-48' />
                    <Skeleton className='h-3.5 w-32' />
                </div>
                <Skeleton className='h-6 w-14 shrink-0 rounded-full' />
            </div>
            <div className='space-y-2'>
                <Skeleton className='h-10 w-full rounded-lg' />
                <Skeleton className='h-10 w-full rounded-lg' />
            </div>
        </Card>
    )
}

const DEFAULT_ROLE_ENTRY: CreateReactionRoleEntry = {
    roleId: '',
    label: '',
    emoji: '',
    style: 'Primary',
}

interface MessageFormEntry extends CreateReactionRoleEntry {}

interface MessageFormProps {
    guildId: string
    open: boolean
    mode: 'create' | 'edit'
    initialMessage?: ReactionRoleMessage
    onClose: () => void
    onSuccess: () => void
}

function MessageForm({
    guildId,
    open,
    mode,
    initialMessage,
    onClose,
    onSuccess,
}: MessageFormProps) {
    const [channels, setChannels] = useState<GuildChannelOption[]>([])
    const [roles, setRoles] = useState<GuildRoleOption[]>([])
    const [loadingOptions, setLoadingOptions] = useState(false)

    const [channelId, setChannelId] = useState('')
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imageFilePreviewUrl, setImageFilePreviewUrl] = useState<string>('')
    const [entries, setEntries] = useState<MessageFormEntry[]>([
        { ...DEFAULT_ROLE_ENTRY },
    ])
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        if (!open) {
            setChannels([])
            setRoles([])
            return
        }
        setLoadingOptions(true)
        Promise.all([
            api.guilds.getChannels(guildId),
            api.guilds.getRoles(guildId),
        ])
            .then(([ch, ro]) => {
                setChannels(ch.data.channels)
                setRoles(ro.data.roles)
            })
            .catch(() => setError('Failed to load channels/roles'))
            .finally(() => setLoadingOptions(false))
    }, [open, guildId])

    useEffect(() => {
        if (mode === 'edit' && initialMessage) {
            // Prefill edit form
            setChannelId(initialMessage.channelId)
            setTitle(initialMessage.title || '')
            setDescription(initialMessage.description || '')
            setImageUrl(initialMessage.imageUrl || '')
            setImageFile(null)
            setImageFilePreviewUrl('')
            const NORMALIZED_STYLE: Record<
                string,
                'Primary' | 'Secondary' | 'Success' | 'Danger'
            > = {
                '1': 'Primary',
                '2': 'Secondary',
                '3': 'Success',
                '4': 'Danger',
                Primary: 'Primary',
                Secondary: 'Secondary',
                Success: 'Success',
                Danger: 'Danger',
            }
            const newEntries = initialMessage.mappings.map((m) => ({
                roleId: m.roleId,
                label: m.label,
                emoji: m.emoji || '',
                style: NORMALIZED_STYLE[m.style] ?? 'Primary',
            }))
            setEntries(
                newEntries.length > 0
                    ? newEntries
                    : [{ ...DEFAULT_ROLE_ENTRY }],
            )
        } else {
            // Reset for create mode
            setChannelId('')
            setTitle('')
            setDescription('')
            setImageUrl('')
            setImageFile(null)
            setImageFilePreviewUrl('')
            setEntries([{ ...DEFAULT_ROLE_ENTRY }])
        }
        setError(null)
    }, [mode, initialMessage, open])

    function resetForm() {
        if (imageFilePreviewUrl) {
            URL.revokeObjectURL(imageFilePreviewUrl)
        }
        setChannelId('')
        setTitle('')
        setDescription('')
        setImageUrl('')
        setImageFile(null)
        setImageFilePreviewUrl('')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
        setEntries([{ ...DEFAULT_ROLE_ENTRY }])
        setError(null)
    }

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (file) {
            setImageFile(file)
            const previewUrl = URL.createObjectURL(file)
            setImageFilePreviewUrl(previewUrl)
        }
    }

    function handleFileClear() {
        setImageFile(null)
        if (imageFilePreviewUrl) {
            URL.revokeObjectURL(imageFilePreviewUrl)
        }
        setImageFilePreviewUrl('')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    function handleClose() {
        if (imageFilePreviewUrl) {
            URL.revokeObjectURL(imageFilePreviewUrl)
        }
        resetForm()
        onClose()
    }

    function updateEntry(
        index: number,
        field: keyof MessageFormEntry,
        value: string,
    ) {
        setEntries((prev) =>
            prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
        )
    }

    function addEntry() {
        if (entries.length >= 25) return
        setEntries((prev) => [...prev, { ...DEFAULT_ROLE_ENTRY }])
    }

    function removeEntry(index: number) {
        setEntries((prev) => prev.filter((_, i) => i !== index))
    }

    async function handleSubmit() {
        setError(null)
        if (!channelId) {
            setError('Select a channel')
            return
        }
        if (!title.trim()) {
            setError('Title is required')
            return
        }
        if (!description.trim()) {
            setError('Description is required')
            return
        }
        const validEntries = entries.filter((e) => e.roleId && e.label.trim())
        if (validEntries.length === 0) {
            setError('Add at least one role with a label')
            return
        }

        setSubmitting(true)
        try {
            if (mode === 'create') {
                await api.reactionRoles.create(
                    guildId,
                    {
                        channelId,
                        title: title.trim(),
                        description: description.trim(),
                        imageUrl:
                            !imageFile && imageUrl.trim()
                                ? imageUrl.trim()
                                : undefined,
                        roles: validEntries.map((e) => ({
                            roleId: e.roleId,
                            label: e.label.trim(),
                            emoji: e.emoji?.trim() || undefined,
                            style: e.style,
                        })),
                    },
                    imageFile || undefined,
                )
            } else if (mode === 'edit' && initialMessage) {
                await api.reactionRoles.update(
                    guildId,
                    initialMessage.messageId,
                    {
                        title: title.trim(),
                        description: description.trim(),
                        imageUrl:
                            !imageFile && imageUrl.trim()
                                ? imageUrl.trim()
                                : undefined,
                        roles: validEntries.map((e) => ({
                            roleId: e.roleId,
                            label: e.label.trim(),
                            emoji: e.emoji?.trim() || undefined,
                            style: e.style,
                        })),
                    },
                    imageFile || undefined,
                )
            }
            resetForm()
            onSuccess()
        } catch (err) {
            const msg =
                mode === 'create'
                    ? 'Failed to create reaction role message'
                    : 'Failed to update reaction role message'
            setError(msg)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'create'
                            ? 'Create Reaction Role Message'
                            : 'Edit Reaction Role Message'}
                    </DialogTitle>
                </DialogHeader>

                <div className='space-y-4 py-2'>
                    {error && (
                        <p className='type-body-sm rounded-md border border-lucky-error/30 bg-lucky-error/10 px-3 py-2 text-lucky-error'>
                            {error}
                        </p>
                    )}

                    <div className='space-y-1.5'>
                        <Label>Channel</Label>
                        <Select
                            value={channelId}
                            onValueChange={setChannelId}
                            disabled={loadingOptions || mode === 'edit'}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder='Select a channel' />
                            </SelectTrigger>
                            <SelectContent>
                                {channels.map((ch) => (
                                    <SelectItem key={ch.id} value={ch.id}>
                                        # {ch.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {mode === 'edit' && (
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Channel cannot be changed on edit
                            </p>
                        )}
                    </div>

                    <div className='space-y-1.5'>
                        <Label>Title</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder='e.g. Pick your roles'
                            maxLength={256}
                        />
                    </div>

                    <div className='space-y-1.5'>
                        <Label>Description</Label>
                        <FormattingToolbar textareaRef={descriptionRef} />
                        <AutoGrowTextarea
                            ref={descriptionRef}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder='Explain how to use the buttons below…'
                            maxLength={4096}
                            minRows={3}
                            maxRows={12}
                        />
                    </div>

                    <div className='space-y-1.5'>
                        <Label>Image URL (optional)</Label>
                        <Input
                            value={imageFile ? '' : imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            placeholder='https://example.com/image.png'
                            maxLength={2048}
                            disabled={!!imageFile}
                        />
                        {!imageFile &&
                            imageUrl.trim() &&
                            /^https?:\/\//i.test(imageUrl.trim()) && (
                                <div className='mt-2 overflow-hidden rounded-md border border-lucky-border'>
                                    <img
                                        src={imageUrl}
                                        alt='Preview'
                                        className='max-h-40 w-full object-cover'
                                        onError={(e) => {
                                            const img =
                                                e.target as HTMLImageElement
                                            img.src =
                                                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"%3E%3Crect x="3" y="3" width="18" height="18" rx="2"/%3E%3Ccircle cx="8.5" cy="8.5" r="1.5"/%3E%3Cpath d="m21 15-5-5L5 21"/%3E%3C/svg%3E'
                                            img.classList.add(
                                                'p-4',
                                                'text-lucky-text-tertiary',
                                            )
                                        }}
                                    />
                                </div>
                            )}
                    </div>

                    <div className='space-y-1.5'>
                        <Label>Upload Image (optional)</Label>
                        <div className='flex items-center gap-2'>
                            <Button
                                variant='secondary'
                                size='sm'
                                onClick={() => fileInputRef.current?.click()}
                                disabled={submitting}
                                className='relative'
                            >
                                <Upload className='h-4 w-4' />
                                Choose Image
                                <input
                                    ref={fileInputRef}
                                    type='file'
                                    accept='image/*'
                                    onChange={handleFileSelect}
                                    className='hidden'
                                    aria-label='Upload image file'
                                />
                            </Button>
                            {imageFile && (
                                <div className='flex flex-1 items-center justify-between rounded-md border border-lucky-border bg-lucky-bg-tertiary/40 px-3 py-2'>
                                    <span className='type-body-sm truncate text-lucky-text-primary'>
                                        {imageFile.name}
                                    </span>
                                    <button
                                        type='button'
                                        onClick={handleFileClear}
                                        className='ml-2 text-lucky-text-tertiary hover:text-lucky-error'
                                        aria-label='Clear file'
                                    >
                                        <X className='h-3.5 w-3.5' />
                                    </button>
                                </div>
                            )}
                        </div>
                        {imageFile && imageFilePreviewUrl && (
                            <div className='mt-2 overflow-hidden rounded-md border border-lucky-border'>
                                <img
                                    src={imageFilePreviewUrl}
                                    alt='File preview'
                                    className='max-h-40 w-full object-cover'
                                />
                            </div>
                        )}
                    </div>

                    <div className='sticky top-0 z-10 space-y-2 border-t border-lucky-border bg-lucky-bg-secondary pt-3'>
                        <div className='flex items-center justify-between'>
                            <Label>Roles ({entries.length}/25)</Label>
                            <Button
                                variant='secondary'
                                size='sm'
                                onClick={addEntry}
                                disabled={entries.length >= 25}
                            >
                                <Plus className='h-3.5 w-3.5' />
                                Add role
                            </Button>
                        </div>

                        <div className='space-y-2 overflow-y-auto'>
                            {entries.map((entry, i) => (
                                <div
                                    key={i}
                                    className='space-y-2 rounded-lg border border-lucky-border bg-lucky-bg-tertiary/40 p-3'
                                >
                                    <div className='flex items-center justify-between'>
                                        <span className='type-body-sm font-medium text-lucky-text-secondary'>
                                            Role {i + 1}
                                        </span>
                                        {entries.length > 1 && (
                                            <button
                                                type='button'
                                                aria-label='Remove'
                                                onClick={() => removeEntry(i)}
                                                className='text-lucky-text-tertiary hover:text-lucky-error'
                                            >
                                                <X className='h-3.5 w-3.5' />
                                            </button>
                                        )}
                                    </div>
                                    <div className='grid grid-cols-2 gap-2'>
                                        <div className='space-y-1'>
                                            <Label className='text-xs'>
                                                Role
                                            </Label>
                                            <Select
                                                value={entry.roleId}
                                                onValueChange={(v) =>
                                                    updateEntry(i, 'roleId', v)
                                                }
                                                disabled={loadingOptions}
                                            >
                                                <SelectTrigger className='h-8 text-xs'>
                                                    <SelectValue placeholder='Select role' />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {roles.map((r) => (
                                                        <SelectItem
                                                            key={r.id}
                                                            value={r.id}
                                                        >
                                                            {r.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className='space-y-1'>
                                            <Label className='text-xs'>
                                                Button label
                                            </Label>
                                            <Input
                                                className='h-8 text-xs'
                                                value={entry.label}
                                                onChange={(e) =>
                                                    updateEntry(
                                                        i,
                                                        'label',
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder='Label'
                                                maxLength={80}
                                            />
                                        </div>
                                        <div className='space-y-1'>
                                            <Label className='text-xs'>
                                                Emoji (optional)
                                            </Label>
                                            <EmojiPicker
                                                value={entry.emoji}
                                                onChange={(emoji) =>
                                                    updateEntry(
                                                        i,
                                                        'emoji',
                                                        emoji,
                                                    )
                                                }
                                                guildId={guildId}
                                            />
                                        </div>
                                        <div className='space-y-1'>
                                            <Label className='text-xs'>
                                                Style
                                            </Label>
                                            <Select
                                                value={entry.style ?? 'Primary'}
                                                onValueChange={(v) =>
                                                    updateEntry(i, 'style', v)
                                                }
                                            >
                                                <SelectTrigger className='h-8 text-xs'>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {BUTTON_STYLES.map((s) => (
                                                        <SelectItem
                                                            key={s}
                                                            value={s}
                                                        >
                                                            {s}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant='secondary'
                        onClick={handleClose}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSubmit()}
                        disabled={submitting}
                    >
                        {submitting
                            ? mode === 'create'
                                ? 'Creating…'
                                : 'Updating…'
                            : mode === 'create'
                              ? 'Create'
                              : 'Update'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function ReactionRoles() {
    const { selectedGuild } = useGuildStore()
    const [messages, setMessages] = useState<ReactionRoleMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [selectedMessage, setSelectedMessage] = useState<
        ReactionRoleMessage | undefined
    >()
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [importDialogOpen, setImportDialogOpen] = useState(false)

    const fetchMessages = useCallback(async () => {
        if (!selectedGuild) return
        setLoading(true)
        setError(null)
        try {
            const data = await api.reactionRoles.list(selectedGuild!.id)
            setMessages(data)
        } catch {
            setError('Failed to load reaction role messages.')
        } finally {
            setLoading(false)
        }
    }, [selectedGuild])

    useEffect(() => {
        void fetchMessages()
    }, [fetchMessages])

    async function handleDelete(messageId: string) {
        if (!selectedGuild) return
        setDeleteError(null)
        try {
            await api.reactionRoles.delete(selectedGuild!.id, messageId)
            setMessages((prev) => prev.filter((m) => m.messageId !== messageId))
        } catch {
            setDeleteError('Failed to delete reaction role message.')
        }
    }

    function handleEditClick(message: ReactionRoleMessage) {
        setSelectedMessage(message)
        setFormMode('edit')
        setFormOpen(true)
    }

    function handleCreateClick() {
        setSelectedMessage(undefined)
        setFormMode('create')
        setFormOpen(true)
    }

    function handleFormClose() {
        setFormOpen(false)
        setSelectedMessage(undefined)
    }

    function handleFormSuccess() {
        handleFormClose()
        void fetchMessages()
    }

    function handleExport() {
        const exported = serializeReactionRolesToJSON(messages)
        const jsonString = JSON.stringify(exported, null, 2)
        const blob = new Blob([jsonString], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `reaction-roles-${selectedGuild!.id}.json`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
    }

    function handleImportSuccess() {
        void fetchMessages()
    }

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Users className='h-10 w-10' />}
                title='No server selected'
                description='Select a server from the sidebar to view reaction roles.'
            />
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                title='Reaction Roles'
                description='Create Discord messages with button-based role assignment directly from the dashboard.'
                actions={
                    <div className='flex gap-2'>
                        <Button
                            onClick={handleExport}
                            disabled={messages.length === 0}
                            variant='secondary'
                        >
                            <Download className='h-4 w-4' />
                            Export
                        </Button>
                        <Button
                            onClick={() => setImportDialogOpen(true)}
                            variant='secondary'
                        >
                            <Upload className='h-4 w-4' />
                            Import
                        </Button>
                        <Button onClick={handleCreateClick}>
                            <Plus className='h-4 w-4' />
                            Create
                        </Button>
                    </div>
                }
            />

            {(error ?? deleteError) && (
                <Card className='border-lucky-error/30 bg-lucky-error/5 p-4'>
                    <p className='type-body-sm text-lucky-error'>
                        {error ?? deleteError}
                    </p>
                    {error && (
                        <Button
                            variant='secondary'
                            size='sm'
                            className='mt-3'
                            onClick={() => void fetchMessages()}
                        >
                            Retry
                        </Button>
                    )}
                </Card>
            )}

            {loading ? (
                <div className='space-y-4'>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            ) : messages.length === 0 ? (
                <EmptyState
                    icon={<Sparkles className='h-10 w-10' />}
                    title='No reaction role messages'
                    description='Create your first reaction role message to let members self-assign roles with buttons.'
                />
            ) : (
                <AnimatePresence mode='popLayout'>
                    <div className='space-y-4'>
                        {messages.map((message, i) => (
                            <motion.div
                                key={message.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{
                                    duration: 0.22,
                                    delay: i * 0.04,
                                }}
                            >
                                <MessageCard
                                    message={message}
                                    onDelete={handleDelete}
                                    onEdit={handleEditClick}
                                />
                            </motion.div>
                        ))}
                    </div>
                </AnimatePresence>
            )}

            <MessageForm
                guildId={selectedGuild!.id}
                open={formOpen}
                mode={formMode}
                initialMessage={selectedMessage}
                onClose={handleFormClose}
                onSuccess={handleFormSuccess}
            />

            <ImportDialog
                isOpen={importDialogOpen}
                onClose={() => setImportDialogOpen(false)}
                guildId={selectedGuild!.id}
                onSuccess={handleImportSuccess}
            />
        </div>
    )
}
