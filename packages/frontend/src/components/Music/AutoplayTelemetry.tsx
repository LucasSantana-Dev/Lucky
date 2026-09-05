import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3 } from 'lucide-react'
import { reportError } from '@/lib/sentry'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import { api } from '@/services/api'
import type {
    RecommendationHistory,
    RecommendationSourceAcceptance,
} from '@/services/recommendationsApi'

interface AutoplayTelemetryProps {
    guildId: string
}

const DAY_WINDOWS = [7, 30] as const

function formatRate(rate: number | null): string {
    return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

export default function AutoplayTelemetry({ guildId }: AutoplayTelemetryProps) {
    const { t } = useTranslation()
    const [days, setDays] = useState<(typeof DAY_WINDOWS)[number]>(7)
    const [history, setHistory] = useState<RecommendationHistory | null>(null)
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let mounted = true
        setLoading(true)
        setFailed(false)

        api.recommendations
            .getHistory(guildId, days)
            .then((res) => {
                if (mounted) setHistory(res.data)
            })
            .catch((error) => {
                if (!mounted) return
                reportError('Failed to load recommendation history:', error, {
                    component: 'AutoplayTelemetry',
                    action: 'getHistory',
                })
                setFailed(true)
            })
            .finally(() => {
                if (mounted) setLoading(false)
            })

        return () => {
            mounted = false
        }
    }, [guildId, days])

    const perSource: RecommendationSourceAcceptance[] = history?.perSource ?? []

    const sourceLabel = (source: string | null): string =>
        source ?? t('music.unknown')

    return (
        <Card className='overflow-hidden border border-lucky-border p-0'>
            <div className='flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-lucky-border'>
                <div className='flex items-center gap-2'>
                    <BarChart3
                        className='h-5 w-5 text-lucky-brand'
                        aria-hidden='true'
                    />
                    <h3 className='type-title text-lucky-text-primary'>
                        {t('music.autoplayAcceptance')}
                    </h3>
                </div>
                <div
                    className='flex gap-1'
                    role='group'
                    aria-label={t('music.timeWindow')}
                >
                    {DAY_WINDOWS.map((window) => (
                        <button
                            key={window}
                            type='button'
                            onClick={() => setDays(window)}
                            aria-pressed={days === window}
                            className={`rounded-md px-2.5 py-1 type-meta transition-colors ${
                                days === window
                                    ? 'bg-lucky-brand text-lucky-bg-primary'
                                    : 'bg-lucky-bg-active text-lucky-text-secondary hover:text-lucky-text-primary'
                            }`}
                        >
                            {window}d
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <p className='px-6 py-8 text-center type-body-sm text-lucky-text-tertiary'>
                    {t('music.autoplayLoading')}
                </p>
            ) : failed ? (
                <p className='px-6 py-8 text-center type-body-sm text-lucky-error'>
                    {t('music.autoplayLoadFailed')}
                </p>
            ) : perSource.length === 0 ? (
                <EmptyState
                    bare
                    icon={<BarChart3 className='h-8 w-8' aria-hidden='true' />}
                    title={t('music.noAutoplayHistoryTitle')}
                    description={t('music.noAutoplayHistoryDescription', {
                        days,
                    })}
                />
            ) : (
                <>
                    <div className='grid grid-cols-2 md:grid-cols-[1fr_100px_100px_80px] gap-2 md:gap-4 px-6 py-3 border-b border-lucky-border bg-lucky-bg-tertiary/20'>
                        {[
                            t('music.tableHeaderSource'),
                            t('music.tableHeaderCandidates'),
                            t('music.tableHeaderAccepted'),
                            t('music.tableHeaderRate'),
                        ].map((h) => (
                            <span
                                key={h}
                                className='type-meta text-lucky-text-tertiary text-xs uppercase font-semibold tracking-wide'
                            >
                                {h}
                            </span>
                        ))}
                    </div>
                    <div className='divide-y divide-lucky-border/40'>
                        {perSource.map((row) => (
                            <div
                                key={sourceLabel(row.source)}
                                className='grid grid-cols-2 md:grid-cols-[1fr_100px_100px_80px] gap-2 md:gap-4 px-6 py-3 items-center'
                            >
                                <span className='type-body-sm text-lucky-text-primary capitalize'>
                                    {sourceLabel(row.source)}
                                </span>
                                <span className='type-body-sm text-lucky-text-secondary'>
                                    {row.count}
                                </span>
                                <span className='type-body-sm text-lucky-text-secondary'>
                                    {row.acceptedCount}
                                </span>
                                <span className='type-body-sm text-lucky-text-secondary'>
                                    {formatRate(row.acceptanceRate)}
                                </span>
                            </div>
                        ))}
                    </div>
                    {history?.summary && (
                        <p className='px-6 py-3 type-body-sm text-lucky-text-tertiary border-t border-lucky-border'>
                            {t('music.autoplayOverallSummary', {
                                accepted: history.summary.accepted,
                                total: history.summary.totalPicks,
                                rate: formatRate(
                                    history.summary.globalAcceptanceRate,
                                ),
                                days,
                            })}
                        </p>
                    )}
                </>
            )}
        </Card>
    )
}
