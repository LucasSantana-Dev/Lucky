import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import type { EmbedTemplate, EmbedField } from '@/services/embedsApi'

interface FormState {
    name: string
    title: string
    description: string
    color: string
    footer: string
    thumbnail: string
    image: string
    fields: EmbedField[]
}

const DEFAULT_FORM: FormState = {
    name: '',
    title: '',
    description: '',
    color: '#5865F2',
    footer: '',
    thumbnail: '',
    image: '',
    fields: [],
}

function EmbedPreview({ form }: { form: FormState }) {
    const borderColor = form.color || '#5865F2'
    return (
        <div
            className='rounded-lg overflow-hidden max-w-md'
            style={{ borderLeft: `4px solid ${borderColor}` }}
        >
            <div className='bg-lucky-bg-tertiary p-4 space-y-2'>
                {form.title && (
                    <p className='type-title text-lucky-text-primary'>{form.title}</p>
                )}
                {form.description && (
                    <p className='type-body-sm text-lucky-text-secondary whitespace-pre-wrap'>
                        {form.description}
                    </p>
                )}
                {form.fields.length > 0 && (
                    <div className='grid grid-cols-3 gap-2 mt-2'>
                        {form.fields.map((field, i) => (
                            <div
                                key={i}
                                className={field.inline ? 'col-span-1' : 'col-span-3'}
                            >
                                <p className='type-body-sm text-lucky-text-primary'>{field.name}</p>
                                <p className='type-meta text-lucky-text-secondary'>{field.value}</p>
                            </div>
                        ))}
                    </div>
                )}
                {form.image && (
                    <img
                        src={form.image}
                        alt='embed'
                        className='rounded mt-2 max-w-full'
                        onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                    />
                )}
                {form.footer && (
                    <p className='type-meta text-lucky-text-tertiary mt-2'>{form.footer}</p>
                )}
            </div>
        </div>
    )
}

function FieldEditor({
    fields,
    onChange,
}: {
    fields: EmbedField[]
    onChange: (fields: EmbedField[]) => void
}) {
    const addField = () =>
        onChange([...fields, { name: '', value: '', inline: false }])

    const updateField = (i: number, patch: Partial<EmbedField>) => {
        const updated = fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f))
        onChange(updated)
    }

    const removeField = (i: number) => onChange(fields.filter((_, idx) => idx !== i))

    return (
        <div className='space-y-3'>
            <div className='flex items-center justify-between'>
                <p className='type-body-sm text-lucky-text-secondary'>Fields</p>
                <Button variant='secondary' size='sm' onClick={addField}>
                    <Plus className='h-3 w-3 mr-1' />
                    Add Field
                </Button>
            </div>
            {fields.map((field, i) => (
                <div key={i} className='surface-panel p-3 space-y-2 rounded-lg'>
                    <div className='flex gap-2'>
                        <Input
                            type='text'
                            placeholder='Field name'
                            value={field.name}
                            onChange={(e) => updateField(i, { name: e.target.value })}
                            className='flex-1 bg-lucky-bg-tertiary border-lucky-border'
                        />
                        <button
                            onClick={() => removeField(i)}
                            className='min-h-[44px] min-w-[44px] flex items-center justify-center text-lucky-text-secondary hover:text-red-400 rounded transition-colors'
                            aria-label={`Remove field ${i + 1}`}
                        >
                            <Trash2 className='h-4 w-4' />
                        </button>
                    </div>
                    <textarea
                        placeholder='Field value'
                        value={field.value}
                        onChange={(e) => updateField(i, { value: e.target.value })}
                        rows={2}
                        className='w-full bg-lucky-bg-tertiary border border-lucky-border rounded-md px-3 py-2 type-body-sm text-lucky-text-primary resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                    />
                    <Label className='flex items-center gap-2 type-meta text-lucky-text-secondary cursor-pointer font-normal'>
                        <input
                            type='checkbox'
                            checked={field.inline ?? false}
                            onChange={(e) => updateField(i, { inline: e.target.checked })}
                            className='rounded'
                        />
                        Inline
                    </Label>
                </div>
            ))}
        </div>
    )
}

function EmbedFormModal({
    template,
    onClose,
    onSave,
}: {
    template: EmbedTemplate | null
    onClose: () => void
    onSave: (form: FormState) => Promise<void>
}) {
    const isEdit = template !== null
    const [form, setForm] = useState<FormState>(() => {
        if (!template) return DEFAULT_FORM
        const fields = Array.isArray(template.fields)
            ? (template.fields as EmbedField[])
            : []
        return {
            name: template.name,
            title: template.title ?? '',
            description: template.description ?? '',
            color: template.color ?? '#5865F2',
            footer: template.footer ?? '',
            thumbnail: template.thumbnail ?? '',
            image: template.image ?? '',
            fields,
        }
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value }))

    const handleSave = async () => {
        if (!form.name.trim()) {
            setError('Name is required')
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
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className='surface-card w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl flex flex-col'
            >
                <div className='flex items-center justify-between p-5 border-b border-lucky-border'>
                    <h2 className='type-title text-lucky-text-primary'>
                        {isEdit ? 'Edit Embed Template' : 'New Embed Template'}
                    </h2>
                    <Button variant='secondary' size='sm' onClick={onClose}>
                        Cancel
                    </Button>
                </div>

                <div className='flex flex-1 overflow-hidden'>
                    <div className='flex-1 overflow-y-auto p-5 space-y-4'>
                        {error && (
                            <p className='text-red-400 type-body-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2'>
                                {error}
                            </p>
                        )}

                        <div className='grid grid-cols-2 gap-4'>
                            <div className='space-y-1.5'>
                                <Label className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-normal'>
                                    Template Name *
                                </Label>
                                <Input
                                    type='text'
                                    value={form.name}
                                    onChange={set('name')}
                                    disabled={isEdit}
                                    placeholder='e.g. welcome-message'
                                    className='bg-lucky-bg-tertiary border-lucky-border'
                                />
                            </div>
                            <div className='space-y-1.5'>
                                <Label className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-normal'>
                                    Color
                                </Label>
                                <div className='flex gap-2 items-center'>
                                    <input
                                        type='color'
                                        value={form.color}
                                        onChange={set('color')}
                                        className='h-9 w-12 rounded cursor-pointer bg-transparent border border-lucky-border'
                                    />
                                    <Input
                                        type='text'
                                        value={form.color}
                                        onChange={set('color')}
                                        placeholder='#5865F2'
                                        className='flex-1 bg-lucky-bg-tertiary border-lucky-border font-mono'
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='space-y-1.5'>
                            <Label className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-normal'>
                                Title
                            </Label>
                            <Input
                                type='text'
                                value={form.title}
                                onChange={set('title')}
                                placeholder='Embed title'
                                className='bg-lucky-bg-tertiary border-lucky-border'
                            />
                        </div>

                        <div className='space-y-1.5'>
                            <Label className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-normal'>
                                Description
                            </Label>
                            <textarea
                                value={form.description}
                                onChange={set('description')}
                                placeholder='Embed description (supports markdown)'
                                rows={4}
                                className='w-full bg-lucky-bg-tertiary border border-lucky-border rounded-md px-3 py-2 type-body-sm text-lucky-text-primary resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                            />
                        </div>

                        <div className='grid grid-cols-2 gap-4'>
                            <div className='space-y-1.5'>
                                <Label className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-normal'>
                                    Thumbnail URL
                                </Label>
                                <Input
                                    type='url'
                                    value={form.thumbnail}
                                    onChange={set('thumbnail')}
                                    placeholder='https://...'
                                    className='bg-lucky-bg-tertiary border-lucky-border'
                                />
                            </div>
                            <div className='space-y-1.5'>
                                <Label className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-normal'>
                                    Image URL
                                </Label>
                                <Input
                                    type='url'
                                    value={form.image}
                                    onChange={set('image')}
                                    placeholder='https://...'
                                    className='bg-lucky-bg-tertiary border-lucky-border'
                                />
                            </div>
                        </div>

                        <div className='space-y-1.5'>
                            <Label className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-normal'>
                                Footer
                            </Label>
                            <Input
                                type='text'
                                value={form.footer}
                                onChange={set('footer')}
                                placeholder='Footer text'
                                className='bg-lucky-bg-tertiary border-lucky-border'
                            />
                        </div>

                        <FieldEditor
                            fields={form.fields}
                            onChange={(fields) => setForm((prev) => ({ ...prev, fields }))}
                        />
                    </div>

                    <div className='w-80 border-l border-lucky-border p-5 space-y-3 overflow-y-auto bg-lucky-bg-primary/30'>
                        <p className='type-meta text-lucky-text-tertiary uppercase tracking-wide'>
                            Preview
                        </p>
                        {form.title || form.description || form.fields.length > 0 ? (
                            <EmbedPreview form={form} />
                        ) : (
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Fill in the fields to see a preview
                            </p>
                        )}
                    </div>
                </div>

                <div className='flex justify-end gap-3 p-5 border-t border-lucky-border'>
                    <Button variant='secondary' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Template'}
                    </Button>
                </div>
            </motion.div>
        </div>
    )
}

export default function EmbedBuilder() {
    const { selectedGuild } = useGuildStore()
    const [templates, setTemplates] = useState<EmbedTemplate[]>([])
    const [loading, setLoading] = useState(true)
    const [modalTemplate, setModalTemplate] = useState<EmbedTemplate | null | undefined>(
        undefined,
    )
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

    const fetchTemplates = useCallback(async () => {
        if (!selectedGuild) return
        setLoading(true)
        try {
            const res = await api.embeds.list(selectedGuild.id)
            setTemplates(res)
        } catch {
            setTemplates([])
        } finally {
            setLoading(false)
        }
    }, [selectedGuild])

    useEffect(() => {
        void fetchTemplates()
    }, [fetchTemplates])

    const handleSave = async (form: FormState) => {
        if (!selectedGuild) return
        if (modalTemplate) {
            await api.embeds.update(selectedGuild.id, modalTemplate.name, {
                title: form.title || undefined,
                description: form.description || undefined,
                color: form.color || undefined,
                footer: form.footer || undefined,
                thumbnail: form.thumbnail || undefined,
                image: form.image || undefined,
                fields: form.fields.length > 0 ? form.fields : undefined,
            })
        } else {
            await api.embeds.create(selectedGuild.id, {
                name: form.name,
                embedData: {
                    title: form.title || undefined,
                    description: form.description || undefined,
                    color: form.color || undefined,
                    footer: form.footer || undefined,
                    thumbnail: form.thumbnail || undefined,
                    image: form.image || undefined,
                    fields: form.fields.length > 0 ? form.fields : undefined,
                },
            })
        }
        await fetchTemplates()
    }

    const handleDelete = async (name: string) => {
        if (!selectedGuild) return
        await api.embeds.delete(selectedGuild.id, name)
        setDeleteTarget(null)
        await fetchTemplates()
    }

    const isModalOpen = modalTemplate !== undefined
    const isNew = modalTemplate === null

    return (
        <div className='space-y-6'>
            <div className='flex items-center justify-between'>
                <SectionHeader
                    title='Embed Builder'
                    description='Create and manage reusable Discord embed templates'
                />
                <Button onClick={() => setModalTemplate(null)}>
                    <Plus className='h-4 w-4 mr-2' />
                    New Template
                </Button>
            </div>

            {loading ? (
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className='h-32 rounded-xl' />
                    ))}
                </div>
            ) : templates.length === 0 ? (
                <EmptyState
                    icon={<Layers className='h-10 w-10' />}
                    title='No embed templates'
                    description='Create your first embed template to use in bot commands'
                    action={
                        <Button onClick={() => setModalTemplate(null)}>
                            <Plus className='h-4 w-4 mr-2' />
                            Create Template
                        </Button>
                    }
                />
            ) : (
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                    <AnimatePresence>
                        {templates.map((template) => (
                            <motion.div
                                key={template.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                            >
                                <Card
                                    interactive
                                    className='p-4 space-y-3 h-full flex flex-col'
                                >
                                    <div className='flex items-start justify-between gap-2'>
                                        <div className='flex items-center gap-2 min-w-0'>
                                            <div
                                                className='h-3 w-3 rounded-full flex-shrink-0'
                                                style={{
                                                    backgroundColor: template.color ?? '#5865F2',
                                                }}
                                            />
                                            <p className='type-body text-lucky-text-primary truncate'>
                                                {template.name}
                                            </p>
                                        </div>
                                        <div className='flex gap-1 flex-shrink-0'>
                                            <button
                                                onClick={() => setModalTemplate(template)}
                                                className='flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-lucky-text-secondary hover:text-lucky-brand hover:bg-lucky-bg-active/50 transition-colors'
                                                aria-label={`Edit ${template.name}`}
                                            >
                                                <Pencil className='h-4 w-4' />
                                            </button>
                                            <button
                                                onClick={() => setDeleteTarget(template.name)}
                                                className='flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-lucky-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors'
                                                aria-label={`Delete ${template.name}`}
                                            >
                                                <Trash2 className='h-4 w-4' />
                                            </button>
                                        </div>
                                    </div>

                                    {template.title && (
                                        <p className='type-body-sm text-lucky-text-primary line-clamp-1'>
                                            {template.title}
                                        </p>
                                    )}
                                    {template.description && (
                                        <p className='type-body-sm text-lucky-text-secondary line-clamp-2'>
                                            {template.description}
                                        </p>
                                    )}

                                    <div className='mt-auto pt-2 flex items-center justify-between type-meta text-lucky-text-tertiary'>
                                        <span>Used {template.useCount ?? 0}×</span>
                                        {Array.isArray(template.fields) &&
                                            template.fields.length > 0 && (
                                                <span>{template.fields.length} field{template.fields.length !== 1 ? 's' : ''}</span>
                                            )}
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            <AnimatePresence>
                {isModalOpen && (
                    <EmbedFormModal
                        template={isNew ? null : (modalTemplate as EmbedTemplate)}
                        onClose={() => setModalTemplate(undefined)}
                        onSave={handleSave}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {deleteTarget && (
                    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className='surface-card rounded-xl p-6 max-w-sm w-full space-y-4'
                        >
                            <h3 className='type-title text-lucky-text-primary'>Delete Template</h3>
                            <p className='type-body-sm text-lucky-text-secondary'>
                                Delete <span className='font-mono text-lucky-brand'>"{deleteTarget}"</span>? This
                                cannot be undone.
                            </p>
                            <div className='flex gap-3 justify-end'>
                                <Button
                                    variant='secondary'
                                    onClick={() => setDeleteTarget(null)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant='destructive'
                                    onClick={() => void handleDelete(deleteTarget)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
