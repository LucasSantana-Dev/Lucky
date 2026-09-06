import { useState } from 'react'
import { Wand2, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Card from '@/components/ui/Card'
import EmojiPicker from '@/components/ui/EmojiPicker'
import { api } from '@/services/api'
import type {
    AddRoleDryRunResult,
    AddRoleAppliedResult,
} from '@/services/roleGroupsApi'

interface AddStyledRoleFormProps {
    guildId: string
    groupId: string
    onSuccess: () => void
}

type Preview = AddRoleDryRunResult | AddRoleAppliedResult | null

export function AddStyledRoleForm({
    guildId,
    groupId,
    onSuccess,
}: AddStyledRoleFormProps) {
    const [name, setName] = useState('')
    const [label, setLabel] = useState('')
    const [emoji, setEmoji] = useState('')
    const [colorOverride, setColorOverride] = useState('')
    const [preview, setPreview] = useState<Preview>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirming, setConfirming] = useState(false)

    async function handlePreview() {
        setError(null)
        setLoading(true)
        try {
            const result = await api.roleGroups.addRole(guildId, groupId, {
                name: name.trim(),
                label: label.trim() || name.trim(),
                emoji: emoji.trim() || undefined,
                colorOverride: colorOverride.trim() || undefined,
                dryRun: true,
            })
            setPreview(result)
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : 'Failed to generate preview'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    async function handleConfirm() {
        if (!preview) return
        setError(null)
        setConfirming(true)
        try {
            const result = await api.roleGroups.addRole(guildId, groupId, {
                name: name.trim(),
                label: label.trim() || name.trim(),
                emoji: emoji.trim() || undefined,
                colorOverride: colorOverride.trim() || undefined,
                dryRun: false,
            })
            setPreview(result)
            // Don't reset form if partial_success; let user see the outcome
            if ('status' in result && result.status === 'ok') {
                setName('')
                setLabel('')
                setEmoji('')
                setColorOverride('')
                setPreview(null)
            }
            onSuccess()
        } catch (err) {
            const msg =
                err instanceof Error ? err.message : 'Failed to add role'
            setError(msg)
        } finally {
            setConfirming(false)
        }
    }

    function handleReset() {
        setName('')
        setLabel('')
        setEmoji('')
        setColorOverride('')
        setPreview(null)
        setError(null)
    }

    const isDryRun = preview && 'plan' in preview
    const isApplied = preview && 'status' in preview
    const isPartialSuccess = isApplied && preview.status === 'partial_success'

    return (
        <div className='space-y-4'>
            {!preview ? (
                <Card className='space-y-4 p-5'>
                    <h3 className='type-body-md font-semibold text-lucky-text-primary'>
                        Add Styled Role
                    </h3>

                    {error && (
                        <div className='rounded-md border border-lucky-error/30 bg-lucky-error/10 px-3 py-2'>
                            <p className='type-body-sm text-lucky-error'>
                                {error}
                            </p>
                        </div>
                    )}

                    <div className='grid gap-4'>
                        <div className='space-y-1.5'>
                            <Label>Role Name</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder='e.g. Moderator'
                                maxLength={100}
                                disabled={loading}
                            />
                        </div>

                        <div className='space-y-1.5'>
                            <Label>Button Label (optional)</Label>
                            <Input
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder='Defaults to role name'
                                maxLength={80}
                                disabled={loading}
                            />
                        </div>

                        <div className='space-y-1.5'>
                            <Label>Emoji (optional)</Label>
                            <EmojiPicker
                                value={emoji}
                                onChange={setEmoji}
                                guildId={guildId}
                            />
                        </div>

                        <div className='space-y-1.5'>
                            <Label>Color Override (optional)</Label>
                            <Input
                                value={colorOverride}
                                onChange={(e) =>
                                    setColorOverride(e.target.value)
                                }
                                placeholder='e.g. 0xFF0000'
                                maxLength={8}
                                disabled={loading}
                            />
                            {colorOverride && (
                                <div className='flex items-center gap-2'>
                                    <div
                                        className='h-6 w-6 rounded border border-lucky-border'
                                        style={{
                                            backgroundColor:
                                                colorOverride.startsWith('0x')
                                                    ? `#${colorOverride.slice(2)}`
                                                    : colorOverride,
                                        }}
                                    />
                                    <code className='type-body-sm text-lucky-text-secondary'>
                                        {colorOverride}
                                    </code>
                                </div>
                            )}
                        </div>
                    </div>

                    <Button
                        onClick={() => void handlePreview()}
                        disabled={loading || !name.trim()}
                        className='w-full'
                    >
                        <Wand2 className='h-4 w-4' />
                        Preview
                    </Button>
                </Card>
            ) : isDryRun ? (
                <Card className='space-y-4 p-5'>
                    <div className='flex items-center justify-between'>
                        <h3 className='type-body-md font-semibold text-lucky-text-primary'>
                            Preview
                        </h3>
                        <button
                            type='button'
                            onClick={handleReset}
                            className='text-lucky-text-tertiary hover:text-lucky-error'
                            aria-label='Close preview'
                        >
                            <X className='h-4 w-4' />
                        </button>
                    </div>

                    {error && (
                        <div className='rounded-md border border-lucky-error/30 bg-lucky-error/10 px-3 py-2'>
                            <p className='type-body-sm text-lucky-error'>
                                {error}
                            </p>
                        </div>
                    )}

                    <div className='space-y-3 rounded-lg border border-lucky-border bg-lucky-bg-tertiary/50 p-4'>
                        <div className='space-y-1'>
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Role Name
                            </p>
                            <p className='type-body-md font-medium text-lucky-text-primary'>
                                {preview.plan.roleName}
                            </p>
                        </div>

                        <div className='space-y-1'>
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Button Label
                            </p>
                            <div className='flex items-center gap-2'>
                                {preview.plan.emoji && (
                                    <span className='text-base leading-none'>
                                        {preview.plan.emoji}
                                    </span>
                                )}
                                <p className='type-body-md font-medium text-lucky-text-primary'>
                                    {preview.plan.buttonLabel}
                                </p>
                            </div>
                        </div>

                        <div className='space-y-1'>
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Color
                            </p>
                            <div className='flex items-center gap-2'>
                                <div
                                    data-testid='color-swatch'
                                    className='h-6 w-6 rounded border border-lucky-border'
                                    style={{
                                        backgroundColor:
                                            preview.plan.color.startsWith('0x')
                                                ? `#${preview.plan.color.slice(2)}`
                                                : preview.plan.color,
                                    }}
                                />
                                <code className='type-body-sm text-lucky-text-secondary'>
                                    {preview.plan.color}
                                </code>
                            </div>
                        </div>
                    </div>

                    <div className='flex gap-2'>
                        <Button
                            variant='secondary'
                            onClick={handleReset}
                            disabled={confirming}
                            className='flex-1'
                        >
                            Back
                        </Button>
                        <Button
                            onClick={() => void handleConfirm()}
                            disabled={confirming}
                            className='flex-1'
                        >
                            {confirming ? 'Confirming…' : 'Confirm'}
                        </Button>
                    </div>
                </Card>
            ) : isApplied ? (
                <Card className='space-y-4 p-5'>
                    <h3 className='type-body-md font-semibold text-lucky-text-primary'>
                        Role Added
                    </h3>

                    {error && (
                        <div className='rounded-md border border-lucky-error/30 bg-lucky-error/10 px-3 py-2'>
                            <p className='type-body-sm text-lucky-error'>
                                {error}
                            </p>
                        </div>
                    )}

                    <div className='space-y-3 rounded-lg border border-lucky-border bg-lucky-bg-tertiary/50 p-4'>
                        <div className='space-y-1'>
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Role
                            </p>
                            <p className='type-body-md font-medium text-lucky-text-primary'>
                                {preview.role.name}
                            </p>
                        </div>
                        <div className='space-y-1'>
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Button
                            </p>
                            <div className='flex items-center gap-2'>
                                {preview.mapping.emoji && (
                                    <span className='text-base leading-none'>
                                        {preview.mapping.emoji}
                                    </span>
                                )}
                                <p className='type-body-md font-medium text-lucky-text-primary'>
                                    {preview.mapping.label}
                                </p>
                            </div>
                        </div>
                    </div>

                    {isPartialSuccess && (
                        <div className='rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2'>
                            <p className='type-body-sm text-blue-400'>
                                Role added successfully. The Discord message
                                will re-sync shortly.
                            </p>
                        </div>
                    )}

                    <Button onClick={handleReset} className='w-full'>
                        Add Another
                    </Button>
                </Card>
            ) : null}
        </div>
    )
}
