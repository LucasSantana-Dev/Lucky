import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LifeBuoy, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { api } from '@/services/api'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

type SubmitState = 'idle' | 'submitting' | 'success' | 'error'

export default function SupportPage() {
    const { t } = useTranslation()
    const [searchParams] = useSearchParams()

    // Prefilled, read-only correlation/context carried from an error surface.
    // (The bot's link may also carry `command`; the intake only persists the
    // fields below, so we don't read it here.)
    const cid = searchParams.get('cid') ?? ''
    const guildId = searchParams.get('guildId') ?? ''
    const category = searchParams.get('category') ?? ''

    const [context, setContext] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [fileError, setFileError] = useState<string | null>(null)
    const [state, setState] = useState<SubmitState>('idle')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    // One dedup key per form instance: a retry after a flaky response maps
    // to the same server-side report instead of a duplicate + second staff
    // ping (#1319). A fresh mount is a new submission.
    const [submissionId] = useState(() => crypto.randomUUID())

    const canSubmit = useMemo(
        () => context.trim().length > 0 && !fileError && state !== 'submitting',
        [context, fileError, state],
    )

    function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const next = e.target.files?.[0] ?? null
        if (!next) {
            setFile(null)
            setFileError(null)
            return
        }
        if (!ACCEPTED_TYPES.includes(next.type)) {
            setFileError(t('support.form.imageTypeError'))
            setFile(null)
            return
        }
        if (next.size > MAX_IMAGE_BYTES) {
            setFileError(t('support.form.imageSizeError'))
            setFile(null)
            return
        }
        setFileError(null)
        setFile(next)
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!canSubmit) return

        setState('submitting')
        setErrorMessage(null)

        const formData = new FormData()
        formData.append('context', context.trim())
        if (file) formData.append('image', file)
        if (cid) formData.append('cid', cid)
        if (guildId) formData.append('guildId', guildId)
        if (category) formData.append('category', category)
        formData.append('sid', submissionId)

        try {
            await api.support.submit(formData)
            setState('success')
        } catch (err) {
            setErrorMessage(
                err instanceof Error
                    ? err.message
                    : t('support.form.genericError'),
            )
            setState('error')
        }
    }

    if (state === 'success') {
        return (
            <div className='min-h-screen bg-lucky-bg-primary flex items-center justify-center px-4 py-12'>
                <div className='max-w-md w-full text-center space-y-4'>
                    <CheckCircle2
                        className='h-12 w-12 text-lucky-success mx-auto'
                        aria-hidden='true'
                    />
                    <h1 className='type-h1 text-lucky-text-primary'>
                        {t('support.success.title')}
                    </h1>
                    <p className='type-body text-lucky-text-secondary'>
                        {t('support.success.body')}
                    </p>
                    {cid && (
                        <p className='type-body-sm text-lucky-text-tertiary'>
                            {t('support.referenceId')}:{' '}
                            <code className='text-lucky-text-secondary'>
                                {cid}
                            </code>
                        </p>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className='min-h-screen bg-lucky-bg-primary flex items-center justify-center px-4 py-12'>
            <div className='max-w-lg w-full space-y-6'>
                <header className='flex items-center gap-3'>
                    <LifeBuoy
                        className='h-7 w-7 text-lucky-brand shrink-0'
                        aria-hidden='true'
                    />
                    <div>
                        <h1 className='type-h1 text-lucky-text-primary'>
                            {t('support.title')}
                        </h1>
                        <p className='type-body-sm text-lucky-text-secondary'>
                            {t('support.subtitle')}
                        </p>
                    </div>
                </header>

                {cid && (
                    <div className='type-body-sm text-lucky-text-secondary bg-lucky-bg-active border border-lucky-border rounded-sm p-3'>
                        {t('support.referenceId')}:{' '}
                        <code className='text-lucky-text-primary'>{cid}</code>
                    </div>
                )}

                <form onSubmit={onSubmit} className='space-y-4' noValidate>
                    <div className='space-y-1.5'>
                        <label
                            htmlFor='support-context'
                            className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold'
                        >
                            {t('support.form.contextLabel')}
                        </label>
                        <textarea
                            id='support-context'
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            required
                            rows={6}
                            placeholder={t('support.form.contextPlaceholder')}
                            className='w-full rounded-sm bg-lucky-bg-active border border-lucky-border text-lucky-text-primary type-body p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand'
                        />
                    </div>

                    <div className='space-y-1.5'>
                        <label
                            htmlFor='support-image'
                            className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold'
                        >
                            {t('support.form.imageLabel')}
                        </label>
                        <input
                            id='support-image'
                            type='file'
                            accept={ACCEPTED_TYPES.join(',')}
                            onChange={onFileChange}
                            className='block w-full type-body-sm text-lucky-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-lucky-bg-active file:px-3 file:py-1.5 file:text-lucky-text-primary'
                        />
                        {fileError && (
                            <p
                                className='type-body-sm text-lucky-error'
                                role='alert'
                            >
                                {fileError}
                            </p>
                        )}
                    </div>

                    {state === 'error' && errorMessage && (
                        <div
                            className='flex items-center gap-2 type-body-sm text-lucky-error bg-lucky-error/10 border border-lucky-error/20 rounded-sm p-3'
                            role='alert'
                        >
                            <AlertCircle
                                className='h-4 w-4 shrink-0'
                                aria-hidden='true'
                            />
                            {errorMessage}
                        </div>
                    )}

                    <Button
                        type='submit'
                        disabled={!canSubmit}
                        loading={state === 'submitting'}
                        className='w-full'
                    >
                        <Send className='h-4 w-4' aria-hidden='true' />
                        {t('support.form.submit')}
                    </Button>
                </form>
            </div>
        </div>
    )
}
