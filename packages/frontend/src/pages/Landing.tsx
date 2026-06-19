import { reportError } from '@/lib/sentry'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { motion, useReducedMotion } from 'framer-motion'
import { api } from '@/services/api'
import {
    Star,
    Scale,
    ArrowUpRight,
    Copy,
    Check,
    Server,
    Users,
    Database,
    Layers,
    Music2,
    Shield,
    Wrench,
    SlidersHorizontal,
    LayoutDashboard,
    Sparkles,
} from 'lucide-react'

function GithubMark({
    size = 16,
    className,
}: {
    size?: number
    className?: string
}) {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='currentColor'
            width={size}
            height={size}
            aria-hidden='true'
            className={className}
        >
            <path d='M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.04.78 2.11v3.13c0 .31.21.67.8.56 4.57-1.52 7.85-5.84 7.85-10.91C23.5 5.65 18.35.5 12 .5z' />
        </svg>
    )
}

const REPO_URL = 'https://github.com/LucasSantana-Dev/Lucky'
const CLONE_URL = 'https://github.com/LucasSantana-Dev/Lucky.git'

// Minimal permission set (View Channels, Send Messages, Embed Links, Connect,
// Speak) — matches the /invite command. NOT Administrator: requesting only what
// the bot needs is safer and converts better with server admins.
const BOT_INVITE_PERMISSIONS = '3165184'

// Public Discord Application ID (a.k.a. client_id). Safe to ship: it appears in
// every OAuth invite link and is not a secret. Used as the default so the CTA
// works out of the box; override via VITE_DISCORD_CLIENT_ID for a fork.
const DEFAULT_DISCORD_CLIENT_ID = '962198089161134131'

function getBotInviteUrl(): string {
    const clientId =
        import.meta.env.VITE_DISCORD_CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID
    return clientId
        ? `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${BOT_INVITE_PERMISSIONS}`
        : ''
}

type RepoStats = {
    servers: number
    users: number
    error: boolean
    loading: boolean
}

export default function Landing() {
    const login = useAuthStore((s) => s.login)
    const prefersReducedMotion = useReducedMotion()
    const { t } = useTranslation()
    const [repoStats, setRepoStats] = useState<RepoStats>({
        servers: 0,
        users: 0,
        error: false,
        loading: true,
    })

    useEffect(() => {
        let active = true
        const fetchStats = async () => {
            try {
                const res = await api.stats.getPublic()
                if (!active) return
                setRepoStats({
                    servers: res.data.totalGuilds,
                    users: res.data.totalUsers,
                    error: false,
                    loading: false,
                })
            } catch (error) {
                if (!active) return
                reportError('Failed to fetch bot stats:', error, {
                    component: 'Landing',
                    action: 'fetchBotStats',
                })
                setRepoStats((s) => ({ ...s, error: true, loading: false }))
            }
        }
        fetchStats()
        return () => {
            active = false
        }
    }, [])

    usePageMetadata({
        title: t('landing.meta.title'),
        description: t('landing.meta.description'),
    })

    return (
        <div className='lucky-shell min-h-screen dark text-white bg-lucky-surface-canvas'>
            <TopNav onOpenDashboard={login} />
            <Hero
                stats={repoStats}
                prefersReducedMotion={prefersReducedMotion ?? false}
            />
            <FeatureGrid />
            <CommandList />
            <WhySelfHost />
            <StackList />
            <RepoFooterBanner />
            <FooterSection />
        </div>
    )
}

function TopNav({ onOpenDashboard }: { onOpenDashboard: () => void }) {
    const botInviteUrl = getBotInviteUrl()
    return (
        <header className='sticky top-0 z-30 border-b border-lucky-border-soft bg-lucky-surface-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-lucky-surface-canvas/65'>
            <div className='mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-8'>
                <a
                    href='/'
                    className='inline-flex items-center gap-2 text-lucky-text-strong hover:text-lucky-brand transition-colors'
                >
                    <img
                        src='/lucky-logo.png'
                        alt='Lucky'
                        width='28'
                        height='28'
                        className='h-7 w-7 rounded-full'
                        loading='eager'
                    />
                    <span className='font-mono text-sm font-semibold tracking-tight'>
                        lucky<span className='text-lucky-brand'>.</span>
                    </span>
                </a>
                <nav className='flex items-center gap-1 font-mono text-xs text-lucky-text-muted'>
                    <a
                        href={REPO_URL}
                        target='_blank'
                        rel='noreferrer'
                        className='inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 hover:bg-lucky-surface-panel hover:text-lucky-text-strong transition-colors'
                    >
                        <GithubMark size={13} /> github
                    </a>
                    <a
                        href='/docs'
                        className='hidden sm:inline-flex items-center rounded-md px-2.5 py-1.5 hover:bg-lucky-surface-panel hover:text-lucky-text-strong transition-colors'
                    >
                        docs
                    </a>
                    <button
                        onClick={onOpenDashboard}
                        className='hidden sm:inline-flex items-center rounded-md px-2.5 py-1.5 hover:bg-lucky-surface-panel hover:text-lucky-text-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand'
                    >
                        dashboard
                    </button>
                    {botInviteUrl ? (
                        <a
                            href={botInviteUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='ml-1 inline-flex items-center gap-1 rounded-md bg-lucky-brand px-3 py-1.5 font-semibold text-white hover:bg-lucky-brand-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand focus-visible:ring-offset-2 focus-visible:ring-offset-lucky-surface-canvas'
                        >
                            add to discord{' '}
                            <ArrowUpRight size={12} aria-hidden />
                        </a>
                    ) : (
                        <button
                            disabled
                            className='ml-1 inline-flex items-center gap-1 rounded-md bg-lucky-border-soft px-3 py-1.5 font-semibold text-lucky-text-muted cursor-not-allowed opacity-50'
                            aria-label='Add to Discord (not configured)'
                        >
                            add to discord{' '}
                            <ArrowUpRight size={12} aria-hidden />
                        </button>
                    )}
                </nav>
            </div>
        </header>
    )
}

type HeroProps = {
    stats: RepoStats
    prefersReducedMotion: boolean
}

function Hero({ stats, prefersReducedMotion }: HeroProps) {
    const { t, i18n } = useTranslation()
    const locale = i18n.resolvedLanguage ?? i18n.language
    const botInviteUrl = getBotInviteUrl()

    const animProps = prefersReducedMotion
        ? {}
        : {
              initial: { opacity: 0, y: 16 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
          }

    const catFloat = prefersReducedMotion
        ? {}
        : {
              animate: { y: [0, -6, 0] },
              transition: {
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut' as const,
              },
          }

    return (
        <section className='relative overflow-hidden px-4 py-16 md:py-24 md:px-8'>
            <BlueprintGrid />
            <div className='relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center'>
                <motion.div {...animProps}>
                    <motion.div {...catFloat} className='mb-6 inline-block'>
                        <img
                            src='/lucky-logo.png'
                            alt='Lucky'
                            width='88'
                            height='88'
                            className='h-20 w-20 md:h-22 md:w-22 rounded-full drop-shadow-[0_18px_36px_rgba(236,72,153,0.35)]'
                            loading='eager'
                            decoding='async'
                            fetchPriority='high'
                        />
                    </motion.div>
                    <p className='mb-5 inline-flex items-center gap-2 rounded-full border border-lucky-border-soft bg-lucky-surface-panel px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-lucky-text-muted'>
                        <span
                            className='h-1.5 w-1.5 rounded-full bg-lucky-success'
                            aria-hidden
                        />
                        {t('landing.hero.eyebrow')}
                    </p>
                    <h1 className='mb-6 max-w-[16ch] text-[clamp(2.6rem,5.5vw,4.4rem)] font-black leading-[1.02] tracking-[-0.035em] text-lucky-text-strong'>
                        <span className='block'>
                            {t('landing.hero.headlineLine1')}
                        </span>
                        <span className='block text-lucky-brand'>
                            {t('landing.hero.headlineLine2')}
                        </span>
                    </h1>
                    <p className='mb-8 max-w-[52ch] text-base text-lucky-text-body leading-relaxed md:text-lg'>
                        {t('landing.hero.subtitle')}
                    </p>
                    <div className='flex flex-col gap-2.5 sm:flex-row sm:items-center'>
                        {botInviteUrl ? (
                            <a
                                href={botInviteUrl}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='group inline-flex h-11 items-center justify-center gap-2 rounded-md bg-lucky-brand px-5 font-semibold text-white shadow-[0_6px_24px_-8px_rgba(236,72,153,0.55)] hover:bg-lucky-brand-strong transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand focus-visible:ring-offset-2 focus-visible:ring-offset-lucky-surface-canvas active:scale-[0.98]'
                            >
                                {t('landing.hero.ctaPrimary')}
                                <ArrowUpRight
                                    size={15}
                                    className='transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5'
                                    aria-hidden
                                />
                            </a>
                        ) : (
                            <button
                                disabled
                                className='inline-flex h-11 items-center justify-center gap-2 rounded-md bg-lucky-border-soft px-5 font-semibold text-lucky-text-muted cursor-not-allowed opacity-50 shadow-[0_6px_24px_-8px_rgba(236,72,153,0.0)]'
                                aria-label='Add to Discord (not configured)'
                            >
                                {t('landing.hero.ctaPrimary')}
                                <ArrowUpRight
                                    size={15}
                                    className='transition-transform'
                                    aria-hidden
                                />
                            </button>
                        )}
                        <a
                            href={REPO_URL}
                            target='_blank'
                            rel='noreferrer'
                            className='inline-flex h-11 items-center justify-center gap-2 rounded-md border border-lucky-border-strong bg-transparent px-5 font-semibold text-lucky-text-body hover:bg-lucky-surface-panel hover:text-lucky-text-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand focus-visible:ring-offset-2 focus-visible:ring-offset-lucky-surface-canvas active:scale-[0.98]'
                        >
                            <GithubMark size={14} />{' '}
                            {t('landing.hero.ctaSecondary')}
                        </a>
                    </div>
                </motion.div>

                <motion.div
                    {...(prefersReducedMotion
                        ? {}
                        : {
                              initial: { opacity: 0, y: 24 },
                              animate: { opacity: 1, y: 0 },
                              transition: {
                                  duration: 0.6,
                                  delay: 0.12,
                                  ease: [0.16, 1, 0.3, 1] as const,
                              },
                          })}
                >
                    <RepoCard stats={stats} locale={locale} />
                </motion.div>
            </div>
        </section>
    )
}

function FeatureGrid() {
    const { t } = useTranslation()
    const features = [
        { key: 'music', icon: Music2, span: 'md:col-span-2' },
        { key: 'moderation', icon: Shield, span: 'md:col-span-1' },
        {
            key: 'customCommands',
            icon: SlidersHorizontal,
            span: 'md:col-span-1',
        },
        { key: 'dashboard', icon: LayoutDashboard, span: 'md:col-span-2' },
        { key: 'embeds', icon: Sparkles, span: 'md:col-span-3' },
    ] as const

    return (
        <section className='border-t border-lucky-border-soft px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <div className='mb-10 max-w-2xl'>
                    <h2 className='mb-3 text-3xl font-semibold tracking-tight text-lucky-text-strong md:text-4xl'>
                        {t('landing.features.heading')}
                    </h2>
                    <p className='text-base text-lucky-text-body leading-relaxed'>
                        {t('landing.features.subheading')}
                    </p>
                </div>
                <ul className='grid gap-3 md:grid-cols-3'>
                    {features.map(({ key, icon: Icon, span }) => {
                        const isWide = span !== 'md:col-span-1'
                        return (
                            <li key={key} className={span}>
                                <article className='surface-panel h-full flex flex-col gap-4 rounded-xl p-6 md:p-7'>
                                    <span className='inline-flex h-10 w-10 items-center justify-center rounded-lg bg-lucky-surface-elevated text-lucky-brand'>
                                        <Icon size={18} aria-hidden />
                                    </span>
                                    <div>
                                        <h3
                                            className={`mb-2 font-semibold text-lucky-text-strong tracking-tight ${isWide ? 'text-lg md:text-xl' : 'text-base'}`}
                                        >
                                            {t(
                                                `landing.features.items.${key}.title`,
                                            )}
                                        </h3>
                                        <p className='text-sm text-lucky-text-body leading-relaxed'>
                                            {t(
                                                `landing.features.items.${key}.description`,
                                            )}
                                        </p>
                                    </div>
                                </article>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </section>
    )
}

function BlueprintGrid() {
    return (
        <>
            <div
                aria-hidden
                className='pointer-events-none absolute inset-0 opacity-[0.05]'
                style={{
                    backgroundImage:
                        'radial-gradient(circle, #adbac7 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                }}
            />
            <div
                aria-hidden
                className='pointer-events-none absolute inset-0'
                style={{
                    background:
                        'radial-gradient(ellipse 80% 65% at 50% 30%, transparent 50%, #0f1117 100%)',
                }}
            />
        </>
    )
}

function RepoCard({ stats, locale }: { stats: RepoStats; locale: string }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(`git clone ${CLONE_URL}`)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
        } catch (error) {
            reportError('Clipboard write failed:', error, {
                component: 'Landing',
                action: 'copy',
            })
        }
    }

    const fmt = (n: number) => n.toLocaleString(locale)
    const loading = stats.loading

    return (
        <article
            className='surface-panel font-mono text-sm overflow-hidden rounded-xl border border-lucky-border-soft bg-lucky-surface-sidebar shadow-[0_30px_80px_-40px_rgba(236,72,153,0.25)]'
            aria-label={t('landing.repoCard.name')}
        >
            <header className='flex items-center justify-between gap-3 border-b border-lucky-border-soft bg-lucky-surface-elevated px-4 py-3'>
                <div className='flex items-center gap-2 text-lucky-text-strong'>
                    <GithubMark size={15} />
                    <span className='font-semibold tracking-tight'>
                        {t('landing.repoCard.name')}
                    </span>
                </div>
                <span className='inline-flex items-center gap-1 rounded-full border border-lucky-border-soft px-2 py-0.5 text-[11px] text-lucky-text-muted'>
                    <Scale size={11} aria-hidden />{' '}
                    {t('landing.repoCard.license')}
                </span>
            </header>

            <div className='space-y-4 px-4 py-4'>
                <p className='font-sans text-xs text-lucky-text-body leading-relaxed'>
                    {t('landing.repoCard.description')}
                </p>

                <dl className='grid grid-cols-2 gap-3 text-[12px]'>
                    <RepoStat
                        icon={Server}
                        value={
                            loading
                                ? '…'
                                : stats.error
                                  ? '—'
                                  : fmt(stats.servers)
                        }
                        label={t('landing.repoCard.serversLabel')}
                    />
                    <RepoStat
                        icon={Users}
                        value={
                            loading ? '…' : stats.error ? '—' : fmt(stats.users)
                        }
                        label={t('landing.repoCard.usersLabel')}
                    />
                </dl>

                <div className='flex items-center gap-2 text-[11px] text-lucky-text-muted'>
                    <span
                        className='h-2 w-2 rounded-full bg-[#2b7489]'
                        aria-hidden
                    />
                    {t('landing.repoCard.lang')}
                    <span className='ml-auto inline-flex h-1 flex-1 max-w-[120px] overflow-hidden rounded-full bg-lucky-border-soft'>
                        <span
                            className='h-full bg-[#2b7489]'
                            style={{ width: '96%' }}
                        />
                        <span
                            className='h-full bg-lucky-brand'
                            style={{ width: '4%' }}
                        />
                    </span>
                </div>

                <div className='rounded-md border border-lucky-border-soft bg-lucky-surface-canvas px-3 py-2.5 text-[12px] flex items-center justify-between gap-2 group'>
                    <code className='truncate text-lucky-text-body'>
                        <span className='text-lucky-text-muted select-none'>
                            ${' '}
                        </span>
                        git clone {CLONE_URL}
                    </code>
                    <button
                        onClick={handleCopy}
                        aria-label={t('landing.repoCard.copyClone')}
                        className='shrink-0 inline-flex h-7 w-7 items-center justify-center rounded text-lucky-text-muted hover:bg-lucky-surface-panel hover:text-lucky-text-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand'
                    >
                        {copied ? (
                            <Check size={13} className='text-lucky-success' />
                        ) : (
                            <Copy size={13} />
                        )}
                    </button>
                </div>

                <a
                    href={REPO_URL}
                    target='_blank'
                    rel='noreferrer'
                    className='inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-lucky-border-strong px-3 py-2 text-[12px] font-semibold text-lucky-text-strong hover:bg-lucky-surface-panel transition-colors'
                >
                    {t('landing.repoCard.viewOnGithub')}
                    <ArrowUpRight size={12} aria-hidden />
                </a>
            </div>
        </article>
    )
}

function RepoStat({
    icon: Icon,
    value,
    label,
}: {
    icon: typeof Star
    value: string
    label: string
}) {
    return (
        <div className='flex items-baseline gap-1.5'>
            <Icon
                size={12}
                className='translate-y-[1px] text-lucky-text-muted'
                aria-hidden
            />
            <span className='font-semibold tabular-nums text-lucky-text-strong'>
                {value}
            </span>
            <span className='text-lucky-text-muted'>{label}</span>
        </div>
    )
}

function WhySelfHost() {
    const { t } = useTranslation()
    const items = ['data', 'fork', 'free'] as const
    return (
        <section className='border-t border-lucky-border-soft px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <h2 className='mb-10 max-w-2xl font-mono text-xs uppercase tracking-[0.22em] text-lucky-text-muted'>
                    <span className='mr-2 text-lucky-brand'>{'//'}</span>
                    {t('landing.whySelfHost.heading')}
                </h2>
                <ul className='grid gap-px overflow-hidden rounded-xl border border-lucky-border-soft bg-lucky-border-soft md:grid-cols-3'>
                    {items.map((key) => (
                        <li key={key} className='bg-lucky-surface-sidebar p-7'>
                            <h3 className='mb-2.5 text-base font-semibold text-lucky-text-strong tracking-tight'>
                                {t(`landing.whySelfHost.items.${key}.title`)}
                            </h3>
                            <p className='text-sm text-lucky-text-body leading-relaxed'>
                                {t(
                                    `landing.whySelfHost.items.${key}.description`,
                                )}
                            </p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

function CommandList() {
    const { t } = useTranslation()
    const rows = [
        'play',
        'autoplay',
        'queue',
        'ban',
        'automod',
        'custom',
    ] as const

    const kindColor: Record<string, string> = {
        music: 'text-lucky-brand bg-lucky-brand/10 border-lucky-brand/30',
        mod: 'text-lucky-warning bg-lucky-warning/10 border-lucky-warning/30',
        custom: 'text-lucky-success bg-lucky-success/10 border-lucky-success/30',
        música: 'text-lucky-brand bg-lucky-brand/10 border-lucky-brand/30',
        moderação:
            'text-lucky-warning bg-lucky-warning/10 border-lucky-warning/30',
    }

    return (
        <section className='border-t border-lucky-border-soft bg-lucky-surface-sidebar px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-4xl'>
                <h2 className='mb-8 max-w-2xl text-2xl font-semibold tracking-tight text-lucky-text-strong md:text-3xl'>
                    {t('landing.commands.heading')}
                </h2>
                <ul className='overflow-hidden rounded-xl border border-lucky-border-soft bg-lucky-surface-canvas'>
                    {rows.map((key, idx) => {
                        const name = t(`landing.commands.rows.${key}.name`)
                        const desc = t(
                            `landing.commands.rows.${key}.description`,
                        )
                        const kbd = t(`landing.commands.rows.${key}.kbd`)
                        return (
                            <li
                                key={key}
                                className={`group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-lucky-surface-panel md:px-5 ${
                                    idx > 0
                                        ? 'border-t border-lucky-border-soft'
                                        : ''
                                }`}
                            >
                                <code className='shrink-0 font-mono text-sm font-semibold text-lucky-text-strong w-[120px] md:w-[140px]'>
                                    {name}
                                </code>
                                <p className='flex-1 truncate text-sm text-lucky-text-body'>
                                    {desc}
                                </p>
                                <span
                                    className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                                        kindColor[kbd] ??
                                        'text-lucky-text-muted bg-lucky-surface-elevated border-lucky-border-soft'
                                    }`}
                                >
                                    {kbd}
                                </span>
                            </li>
                        )
                    })}
                </ul>
                <p className='mt-4 font-mono text-xs text-lucky-text-muted'>
                    {t('landing.commands.more')}
                </p>
            </div>
        </section>
    )
}

function StackList() {
    const { t } = useTranslation()
    const stack = useMemo(
        () => [
            { key: 'bot', icon: Music2 },
            { key: 'backend', icon: Server },
            { key: 'frontend', icon: Layers },
            { key: 'postgres', icon: Database },
            { key: 'redis', icon: Wrench },
            { key: 'nginx', icon: Shield },
        ],
        [],
    )

    return (
        <section className='border-t border-lucky-border-soft px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <div className='mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
                    <h2 className='max-w-xl text-2xl font-semibold tracking-tight text-lucky-text-strong md:text-3xl'>
                        {t('landing.stack.heading')}
                    </h2>
                    <p className='max-w-md font-mono text-xs text-lucky-text-muted leading-relaxed'>
                        {t('landing.stack.subheading')}
                    </p>
                </div>
                <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                    {stack.map(({ key, icon: Icon }) => (
                        <li
                            key={key}
                            className='surface-panel flex items-start gap-3 rounded-lg p-4'
                        >
                            <span className='mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-lucky-surface-elevated text-lucky-brand'>
                                <Icon size={15} aria-hidden />
                            </span>
                            <div>
                                <p className='font-mono text-sm font-semibold text-lucky-text-strong'>
                                    {t(`landing.stack.items.${key}.name`)}
                                </p>
                                <p className='mt-1 text-xs text-lucky-text-body leading-relaxed'>
                                    {t(
                                        `landing.stack.items.${key}.description`,
                                    )}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

function RepoFooterBanner() {
    const { t } = useTranslation()
    return (
        <section className='relative overflow-hidden border-t border-lucky-border-soft bg-lucky-surface-canvas px-4 py-16 md:px-8'>
            <BlueprintGrid />
            <div className='relative mx-auto max-w-3xl text-center'>
                <h2 className='mb-3 text-2xl font-semibold tracking-tight text-lucky-text-strong md:text-3xl'>
                    {t('landing.footerRepo.heading')}
                </h2>
                <p className='mx-auto mb-6 max-w-xl text-sm text-lucky-text-body md:text-base'>
                    {t('landing.footerRepo.subheading')}
                </p>
                <a
                    href={REPO_URL}
                    target='_blank'
                    rel='noreferrer'
                    className='inline-flex h-11 items-center gap-2 rounded-md border border-lucky-border-strong bg-lucky-surface-panel px-5 font-mono text-sm font-semibold text-lucky-text-strong hover:bg-lucky-surface-elevated transition-colors'
                >
                    <GithubMark size={15} /> github.com/LucasSantana-Dev/Lucky{' '}
                    <ArrowUpRight size={13} aria-hidden />
                </a>
            </div>
        </section>
    )
}

function FooterSection() {
    const { t } = useTranslation()
    return (
        <footer className='border-t border-lucky-border-soft px-4 py-12 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <div className='grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr] md:gap-12'>
                    <div className='space-y-3'>
                        <div className='inline-flex items-baseline gap-1.5 font-mono text-sm font-semibold text-lucky-text-strong'>
                            lucky<span className='text-lucky-brand'>.</span>
                        </div>
                        <p className='max-w-xs text-sm text-lucky-text-muted'>
                            {t('landing.footer.tagline')}
                        </p>
                    </div>
                    <FooterColumn
                        heading={t('landing.footer.links')}
                        links={[
                            {
                                href: REPO_URL,
                                label: t('landing.footer.github'),
                                external: true,
                            },
                            { href: '/docs', label: t('landing.footer.docs') },
                            {
                                href: '/changelog',
                                label: t('landing.footer.changelog'),
                            },
                        ]}
                    />
                    <FooterColumn
                        heading={t('landing.footer.support')}
                        links={[
                            {
                                href: 'https://discord.gg/lucky',
                                label: t('landing.footer.discord'),
                                external: true,
                            },
                            {
                                href: '/terms',
                                label: t('landing.footer.terms'),
                            },
                            {
                                href: '/privacy',
                                label: t('landing.footer.privacy'),
                            },
                        ]}
                    />
                </div>
                <div className='mt-10 flex flex-col items-start justify-between gap-3 border-t border-lucky-border-soft pt-6 md:flex-row md:items-center'>
                    <p className='font-mono text-xs text-lucky-text-muted'>
                        {t('landing.footer.copyright')}
                    </p>
                    <p className='text-xs text-lucky-text-muted'>
                        {t('landing.footer.supportCopy')}
                    </p>
                </div>
            </div>
        </footer>
    )
}

function FooterColumn({
    heading,
    links,
}: {
    heading: string
    links: Array<{ href: string; label: string; external?: boolean }>
}) {
    return (
        <div>
            <h4 className='mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-lucky-text-muted'>
                {heading}
            </h4>
            <ul className='space-y-2.5'>
                {links.map(({ href, label, external }) => (
                    <li key={href}>
                        <a
                            href={href}
                            {...(external
                                ? { target: '_blank', rel: 'noreferrer' }
                                : {})}
                            className='inline-flex items-center gap-1 text-sm text-lucky-text-muted hover:text-lucky-brand transition-colors'
                        >
                            {label}
                            {external ? (
                                <ArrowUpRight size={11} aria-hidden />
                            ) : null}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    )
}
