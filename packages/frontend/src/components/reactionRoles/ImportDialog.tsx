import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AutoGrowTextarea from '@/components/ui/AutoGrowTextarea'
import { deserializeReactionRolesJSON } from '@/utils/reactionRolesExport'
import Card from '@/components/ui/Card'
import { api } from '@/services/api'

interface ImportDialogProps {
    isOpen: boolean
    onClose: () => void
    guildId: string
    onSuccess: () => void
}

export function ImportDialog({
    isOpen,
    onClose,
    guildId,
    onSuccess,
}: ImportDialogProps) {
    const [jsonInput, setJsonInput] = useState('')
    const [validationErrors, setValidationErrors] = useState<string[]>([])
    const [isImporting, setIsImporting] = useState(false)
    const [importProgress, setImportProgress] = useState('')
    const [importErrors, setImportErrors] = useState<Record<number, string>>({})
    function handleJsonChange(value: string) {
        setJsonInput(value)
        setValidationErrors([])
        setImportErrors({})
    }

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            const content = event.target?.result as string
            handleJsonChange(content)
        }
        reader.readAsText(file)
    }

    async function handleImport() {
        const result = deserializeReactionRolesJSON(jsonInput)

        if (!result.valid) {
            setValidationErrors(result.errors)
            return
        }

        setImportProgress('')
        setImportErrors({})
        setIsImporting(true)

        const errors: Record<number, string> = {}
        let successCount = 0

        for (let i = 0; i < result.data.length; i++) {
            const payload = result.data[i]
            setImportProgress(`Creating ${i + 1}/${result.data.length}...`)

            try {
                await api.reactionRoles.create(guildId, payload)
                successCount++
            } catch (error) {
                errors[i] =
                    error instanceof Error ? error.message : 'Unknown error'
            }
        }

        setIsImporting(false)

        if (Object.keys(errors).length > 0) {
            setImportErrors(errors)
            setImportProgress(
                `Completed with ${Object.keys(errors).length} error(s). ${successCount} created.`,
            )
        } else {
            setImportProgress(
                `Successfully created ${successCount} message(s)!`,
            )
            setTimeout(() => {
                setJsonInput('')
                setValidationErrors([])
                setImportProgress('')
                onSuccess()
                onClose()
            }, 1500)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className='max-h-[90vh] max-w-2xl overflow-y-auto'>
                <DialogHeader>
                    <DialogTitle>Import Reaction Roles</DialogTitle>
                </DialogHeader>

                <div className='space-y-4'>
                    <div>
                        <Label htmlFor='json-paste'>Paste JSON</Label>
                        <AutoGrowTextarea
                            id='json-paste'
                            placeholder='Paste JSON exported from the dashboard...'
                            value={jsonInput}
                            onChange={(e) =>
                                handleJsonChange(e.currentTarget.value)
                            }
                            disabled={isImporting}
                            className='min-h-[200px]'
                        />
                    </div>

                    <div>
                        <Label htmlFor='json-file'>Or upload a file</Label>
                        <Input
                            id='json-file'
                            type='file'
                            accept='.json'
                            onChange={handleFileSelect}
                            disabled={isImporting}
                        />
                    </div>

                    {validationErrors.length > 0 && (
                        <Card className='border-lucky-error/30 bg-lucky-error/5 p-4'>
                            <div className='flex gap-3'>
                                <AlertCircle className='h-5 w-5 shrink-0 text-lucky-error' />
                                <div className='space-y-1'>
                                    <p className='type-body-sm font-medium text-lucky-error'>
                                        Validation errors
                                    </p>
                                    {validationErrors.map((error, i) => (
                                        <p
                                            key={i}
                                            className='type-body-sm text-lucky-error/90'
                                        >
                                            • {error}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    )}

                    {importProgress && (
                        <Card className='bg-lucky-bg-active/50 p-4'>
                            <p className='type-body-sm text-lucky-text-secondary'>
                                {importProgress}
                            </p>
                        </Card>
                    )}

                    {Object.keys(importErrors).length > 0 && (
                        <Card className='border-lucky-error/30 bg-lucky-error/5 p-4'>
                            <p className='type-body-sm font-medium text-lucky-error mb-2'>
                                Import errors
                            </p>
                            {Object.entries(importErrors).map(
                                ([index, error]) => (
                                    <p
                                        key={index}
                                        className='type-body-sm text-lucky-error/90'
                                    >
                                        • Item {index}: {error}
                                    </p>
                                ),
                            )}
                        </Card>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant='secondary'
                        onClick={onClose}
                        disabled={isImporting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!jsonInput.trim() || isImporting}
                    >
                        {isImporting && (
                            <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                        )}
                        Import
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
