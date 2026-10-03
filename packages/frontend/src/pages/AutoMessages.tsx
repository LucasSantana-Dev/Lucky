import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { MessageSquare, Plus, Hash, Pencil, Trash2, Reply } from 'lucide-react'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import type { AutoMessage, AutoMessageType } from '@/types'
import {
    buildCreatePayload,
    buildUpdatePayload,
    type CreateAutoMessageInput,
    type UpdateAutoMessageInput,
} from '@/services/autoMessagesApi'
import { useTranslation } from 'react-i18next'

const MESSAGE_TYPES: AutoMessageType[] = ['welcome', 'leave', 'auto_response']

const TYPE_LABEL_KEY: Record<AutoMessageType, string> = {
    welcome: 'autoMessages.typeWelcome',
    leave: 'autoMessages.typeLeave',
    auto_response: 'autoMessages.typeAutoResponse',
}

interface MessageFormProps {
    open: boolean
    initial?: AutoMessage
    onSave: (
        data: CreateAutoMessageInput | UpdateAutoMessageInput,
    ) => Promise<void>
    onClose: () => void
}

function MessageFormDialog({
    open,
    initial,
    onSave,
    onClose,
}: MessageFormProps) {
    const { t } = useTranslation()
    const [type, setType] = useState<AutoMessageType>(
        initial?.type ?? 'welcome',
    )
    const [channelId, setChannelId] = useState(initial?.channelId ?? '')
    const [message, setMessage] = useState(initial?.message ?? '')
    const [trigger, setTrigger] = useState(initial?.trigger ?? '')
    const [exactMatch, setExactMatch] = useState(initial?.exactMatch ?? false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (open) {
            setType(initial?.type ?? 'welcome')
            setChannelId(initial?.channelId ?? '')
            setMessage(initial?.message ?? '')
            setTrigger(initial?.trigger ?? '')
            setExactMatch(initial?.exactMatch ?? false)
        }
    }, [open, initial])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        try {
            const form = { type, message, channelId, trigger, exactMatch }
            await onSave(
                initial ? buildUpdatePayload(form) : buildCreatePayload(form),
            )
            onClose()
        } catch {
            toast.error(t('autoMessages.saveError'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v: boolean) => {
                if (!v) onClose()
            }}
        >
            <DialogContent className='bg-lucky-bg-secondary border-lucky-border max-w-md'>
                <DialogHeader>
                    <DialogTitle className='type-title text-lucky-text-primary'>
                        {initial
                            ? t('autoMessages.editAutoMessage')
                            : t('autoMessages.newAutoMessage')}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4 mt-2'>
                    <div className='space-y-1.5'>
                        <Label
                            htmlFor='am-type'
                            className='type-meta text-lucky-text-secondary'
                        >
                            {t('autoMessages.type')}
                        </Label>
                        <select
                            id='am-type'
                            className='h-9 w-full rounded-md border border-lucky-border bg-lucky-bg-tertiary px-3 text-sm text-white disabled:opacity-50'
                            value={type}
                            onChange={(e) =>
                                setType(e.target.value as AutoMessageType)
                            }
                            disabled={!!initial}
                        >
                            {MESSAGE_TYPES.map((value) => (
                                <option key={value} value={value}>
                                    {t(TYPE_LABEL_KEY[value])}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className='space-y-1.5'>
                        <Label
                            htmlFor='am-channel'
                            className='type-meta text-lucky-text-secondary'
                        >
                            {t('autoMessages.channelId')}
                        </Label>
                        <Input
                            id='am-channel'
                            className='bg-lucky-bg-tertiary border-lucky-border text-white placeholder:text-lucky-text-tertiary'
                            placeholder={t('autoMessages.channelIdPlaceholder')}
                            value={channelId}
                            onChange={(e) => setChannelId(e.target.value)}
                        />
                    </div>
                    <div className='space-y-1.5'>
                        <Label
                            htmlFor='am-message'
                            className='type-meta text-lucky-text-secondary'
                        >
                            {t('autoMessages.message')}
                        </Label>
                        <textarea
                            id='am-message'
                            className='w-full rounded-lg border border-lucky-border bg-lucky-bg-tertiary px-3 py-2 type-body-sm text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:border-lucky-focus focus-visible:ring-2 focus-visible:ring-lucky-focus resize-none'
                            placeholder={t('autoMessages.messagePlaceholder')}
                            rows={3}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                        />
                    </div>
                    {type === 'auto_response' && (
                        <>
                            <div className='space-y-1.5'>
                                <Label
                                    htmlFor='am-trigger'
                                    className='type-meta text-lucky-text-secondary'
                                >
                                    {t('autoMessages.trigger')}
                                </Label>
                                <Input
                                    id='am-trigger'
                                    className='bg-lucky-bg-tertiary border-lucky-border text-white placeholder:text-lucky-text-tertiary'
                                    placeholder={t(
                                        'autoMessages.triggerPlaceholder',
                                    )}
                                    value={trigger}
                                    onChange={(e) => setTrigger(e.target.value)}
                                    required
                                />
                            </div>
                            <div className='flex items-center gap-3'>
                                <Switch
                                    id='am-exact-match'
                                    checked={exactMatch}
                                    onCheckedChange={setExactMatch}
                                />
                                <Label
                                    htmlFor='am-exact-match'
                                    className='type-body-sm text-lucky-text-secondary cursor-pointer'
                                >
                                    {t('autoMessages.exactMatch')}
                                </Label>
                            </div>
                        </>
                    )}
                    <div className='flex justify-end gap-2 pt-2 border-t border-lucky-border'>
                        <Button
                            variant='ghost'
                            type='button'
                            onClick={onClose}
                            disabled={saving}
                        >
                            {t('autoMessages.cancel')}
                        </Button>
                        <Button
                            variant='primary'
                            type='submit'
                            disabled={saving}
                        >
                            {saving
                                ? t('autoMessages.saving')
                                : t('autoMessages.save')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export default function AutoMessagesPage() {
    const { t } = useTranslation()
    const prefersReducedMotion = useReducedMotion()
    const { selectedGuild } = useGuildStore()
    const [messages, setMessages] = useState<AutoMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState<AutoMessage | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AutoMessage | null>(null)

    const fetchMessages = useCallback(async () => {
        if (!selectedGuild?.id) return
        setLoading(true)
        try {
            const res = await api.autoMessages.list(selectedGuild.id)
            setMessages(
                Array.isArray(res.data.messages) ? res.data.messages : [],
            )
        } catch {
            setMessages([])
        } finally {
            setLoading(false)
        }
    }, [selectedGuild?.id])

    useEffect(() => {
        void fetchMessages()
    }, [fetchMessages])

    async function handleSave(
        data: CreateAutoMessageInput | UpdateAutoMessageInput,
    ) {
        if (!selectedGuild?.id) return
        if (editing) {
            await api.autoMessages.update(
                selectedGuild.id,
                editing.id,
                data as UpdateAutoMessageInput,
            )
        } else {
            await api.autoMessages.create(
                selectedGuild.id,
                data as CreateAutoMessageInput,
            )
        }
        await fetchMessages()
    }

    async function handleDelete(id: string) {
        if (!selectedGuild?.id) return
        try {
            await api.autoMessages.delete(selectedGuild.id, id)
            setDeleteTarget(null)
            await fetchMessages()
        } catch {
            toast.error(t('autoMessages.deleteError'))
        }
    }

    function openCreate() {
        setEditing(null)
        setModalOpen(true)
    }

    function openEdit(msg: AutoMessage) {
        setEditing(msg)
        setModalOpen(true)
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <MessageSquare className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h1 className='type-h2 text-lucky-text-primary mb-2'>
                    {t('autoMessages.noServerSelected')}
                </h1>
                <p className='type-body text-lucky-text-secondary'>
                    {t('autoMessages.selectServerToManage')}
                </p>
            </div>
        )
    }

    return (
        <>
            <MessageFormDialog
                open={modalOpen}
                initial={editing ?? undefined}
                onSave={handleSave}
                onClose={() => setModalOpen(false)}
            />
            <div className='space-y-6'>
                <div className='flex items-start justify-between'>
                    <header>
                        <h1 className='type-h1 text-lucky-text-primary'>
                            {t('autoMessages.title')}
                        </h1>
                        <p className='type-body text-lucky-text-secondary mt-1'>
                            {t('autoMessages.subtitle', {
                                name: selectedGuild.name,
                            })}
                        </p>
                    </header>
                    <Button
                        variant='primary'
                        className='gap-2'
                        onClick={openCreate}
                    >
                        <Plus className='w-4 h-4' aria-hidden='true' />{' '}
                        {t('autoMessages.newMessage')}
                    </Button>
                </div>

                {loading ? (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Card key={i} className='p-5 space-y-3'>
                                <Skeleton className='h-5 w-36' />
                                <Skeleton className='h-4 w-full' />
                                <Skeleton className='h-4 w-2/3' />
                                <div className='flex gap-2'>
                                    <Skeleton className='h-6 w-16 rounded-full' />
                                    <Skeleton className='h-6 w-20 rounded-full' />
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : messages.length > 0 ? (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <AnimatePresence mode='popLayout'>
                            {messages.map((msg, i) => (
                                <motion.div
                                    key={msg.id}
                                    layout={!prefersReducedMotion}
                                    initial={
                                        prefersReducedMotion
                                            ? false
                                            : { opacity: 0, y: 8 }
                                    }
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={
                                        prefersReducedMotion
                                            ? { opacity: 0 }
                                            : { opacity: 0, scale: 0.95 }
                                    }
                                    transition={{
                                        duration: 0.2,
                                        delay: prefersReducedMotion
                                            ? 0
                                            : i * 0.03,
                                    }}
                                >
                                    <Card className='p-5 border border-lucky-border hover:border-lucky-border-strong transition-all'>
                                        <div className='flex items-start justify-between mb-3'>
                                            <div className='flex items-center gap-2'>
                                                <div className='p-2 rounded-lg bg-lucky-brand/15'>
                                                    <MessageSquare
                                                        className='w-4 h-4 text-lucky-brand-text'
                                                        aria-hidden='true'
                                                    />
                                                </div>
                                                <h3 className='type-body-sm font-semibold text-lucky-text-primary'>
                                                    {t(
                                                        TYPE_LABEL_KEY[
                                                            msg.type
                                                        ],
                                                    )}
                                                </h3>
                                            </div>
                                            <div className='flex items-center gap-1'>
                                                <button
                                                    onClick={() =>
                                                        openEdit(msg)
                                                    }
                                                    className='p-1.5 rounded-md text-lucky-text-tertiary hover:text-lucky-text-primary hover:bg-lucky-bg-active transition-colors'
                                                    aria-label={t(
                                                        'autoMessages.editAriaLabel',
                                                        {
                                                            type: t(
                                                                TYPE_LABEL_KEY[
                                                                    msg.type
                                                                ],
                                                            ),
                                                        },
                                                    )}
                                                >
                                                    <Pencil
                                                        className='w-3.5 h-3.5'
                                                        aria-hidden='true'
                                                    />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setDeleteTarget(msg)
                                                    }
                                                    className='p-1.5 rounded-md text-lucky-text-tertiary hover:text-lucky-error hover:bg-lucky-error/10 transition-colors'
                                                    aria-label={t(
                                                        'autoMessages.deleteAriaLabel',
                                                        {
                                                            type: t(
                                                                TYPE_LABEL_KEY[
                                                                    msg.type
                                                                ],
                                                            ),
                                                        },
                                                    )}
                                                >
                                                    <Trash2
                                                        className='w-3.5 h-3.5'
                                                        aria-hidden='true'
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                        <p className='type-body-sm text-lucky-text-secondary line-clamp-2 mb-3'>
                                            {msg.message}
                                        </p>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            {msg.channelId && (
                                                <Badge
                                                    variant='outline'
                                                    className='type-meta gap-1 uppercase font-semibold bg-lucky-bg-tertiary border-lucky-border text-lucky-text-secondary rounded-sm'
                                                >
                                                    <Hash
                                                        className='w-3 h-3'
                                                        aria-hidden='true'
                                                    />
                                                    {msg.channelId}
                                                </Badge>
                                            )}
                                            {msg.type === 'auto_response' &&
                                                msg.trigger && (
                                                    <Badge
                                                        variant='outline'
                                                        className='type-meta gap-1 uppercase font-semibold bg-lucky-bg-tertiary border-lucky-border text-lucky-text-secondary rounded-sm'
                                                    >
                                                        <Reply
                                                            className='w-3 h-3'
                                                            aria-hidden='true'
                                                        />
                                                        {msg.trigger}
                                                    </Badge>
                                                )}
                                            <Badge
                                                variant='outline'
                                                className={
                                                    msg.enabled
                                                        ? 'type-meta uppercase font-semibold bg-lucky-brand/10 text-lucky-brand-text border-lucky-brand/20 rounded-sm'
                                                        : 'type-meta uppercase font-semibold bg-lucky-bg-tertiary border-lucky-border text-lucky-text-tertiary rounded-sm'
                                                }
                                            >
                                                {msg.enabled
                                                    ? t('autoMessages.enabled')
                                                    : t(
                                                          'autoMessages.disabled',
                                                      )}
                                            </Badge>
                                        </div>
                                    </Card>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                ) : (
                    <EmptyState
                        icon={
                            <MessageSquare
                                className='w-10 h-10'
                                aria-hidden='true'
                            />
                        }
                        title={t('autoMessages.noAutoMessagesConfigured')}
                        description={t('autoMessages.createScheduledMessages')}
                        action={
                            <Button
                                variant='primary'
                                className='gap-2'
                                onClick={openCreate}
                            >
                                <Plus className='w-4 h-4' aria-hidden='true' />{' '}
                                {t('autoMessages.createAutoMessage')}
                            </Button>
                        }
                    />
                )}
            </div>

            <AnimatePresence>
                {deleteTarget && (
                    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className='surface-card rounded-xl p-6 max-w-sm w-full space-y-4'
                        >
                            <h3 className='type-title text-lucky-text-primary'>
                                {t('autoMessages.deleteMessage')}
                            </h3>
                            <p className='type-body-sm text-lucky-text-secondary'>
                                {t('autoMessages.deleteMessageConfirm', {
                                    type: t(TYPE_LABEL_KEY[deleteTarget.type]),
                                })}
                            </p>
                            <div className='flex gap-3 justify-end'>
                                <Button
                                    variant='secondary'
                                    onClick={() => setDeleteTarget(null)}
                                >
                                    {t('autoMessages.cancel')}
                                </Button>
                                <Button
                                    variant='destructive'
                                    onClick={() =>
                                        void handleDelete(deleteTarget.id)
                                    }
                                >
                                    {t('autoMessages.delete')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    )
}
