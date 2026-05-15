import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { useCountUp } from '@/hooks/useCountUp'
import Button from '@/components/ui/Button'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'
import { useReducedMotion, motion } from 'framer-motion'
import { api } from '@/services/api'
import { Music, Shield, Zap, BarChart3, Palette, Sparkles, ChevronDown, Server, Users, Radio } from 'lucide-react'

const CLIENT_ID = '962198089161134131'
const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=8`

// Asymmetric bento: alternating 2/1 col spans in 3-col grid (avoids identical card grid slop)
const FEATURE_SPANS = [2, 1, 1, 2, 1, 2] as const

export default function Landing() {
    const login = useAuthStore((state) => state.login)
    const prefersReducedMotion = useReducedMotion()
    const { t } = useTranslation()
    const [stats, setStats] = useState<{
        totalGuilds: number
        totalUsers: number
        uptimeSeconds: number
        serversOnline: number
    } | null>(null)
    const [statsLoading, setStatsLoading] = useState(true)

    const { value: guildCount } = useCountUp(stats?.totalGuilds ?? 0, { duration: 1500, delay: 300 })
    const { value: userCount } = useCountUp(stats?.totalUsers ?? 0, { duration: 1500, delay: 500 })

    const displayGuildCount = prefersReducedMotion ? (stats?.totalGuilds ?? 0) : guildCount
    const displayUserCount = prefersReducedMotion ? (stats?.totalUsers ?? 0) : userCount

    useEffect(() => {
        let isActive = true
        const fetchStats = async () => {
            try {
                const response = await api.stats.getPublic()
                if (!isActive) return
                setStats(response.data)
            } catch (error) {
                if (!isActive) return
                console.error('Failed to fetch stats:', error)
            } finally {
                if (isActive) setStatsLoading(false)
            }
        }
        fetchStats()
        return () => {
            isActive = false
        }
    }, [])

    usePageMetadata({
        title: t('landing.meta.title'),
        description: t('landing.meta.description'),
    })

    const logoAnimation = useMemo(
        () =>
            prefersReducedMotion
                ? {}
                : {
                      animate: { scale: [1, 1.03, 1] },
                      transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                  },
        [prefersReducedMotion],
    )

    return (
        <div className='lucky-shell min-h-screen dark text-white'>
            <HeroSection logoAnimation={logoAnimation} onLogin={login} />
            <FeatureSection />
            <StatsSection
                statsLoading={statsLoading}
                guildCount={displayGuildCount}
                userCount={displayUserCount}
                serversOnline={stats?.serversOnline}
            />
            <FAQSection />
            <FooterSection />
        </div>
    )
}

type HeroSectionProps = {
    logoAnimation: Record<string, unknown>
    onLogin: () => void
}

function HeroSection({ logoAnimation, onLogin }: HeroSectionProps) {
    const { t } = useTranslation()

    return (
        <section className='relative min-h-screen flex items-center justify-center px-4 py-24 md:px-8 overflow-hidden bg-lucky-surface-canvas'>
            {/* Blueprint dot grid — Vercel atmosphere anchor */}
            <div
                aria-hidden
                className='pointer-events-none absolute inset-0 opacity-[0.04]'
                style={{
                    backgroundImage: 'radial-gradient(circle, #adbac7 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                }}
            />
            {/* Radial vignette fades grid toward edges */}
            <div
                aria-hidden
                className='pointer-events-none absolute inset-0'
                style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 45%, #0f1117 100%)' }}
            />

            <div className='absolute top-4 right-4 z-20'>
                <LanguageSwitcher />
            </div>

            <motion.div
                className='relative z-10 mx-auto max-w-4xl text-center'
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
                <motion.div {...logoAnimation} className='inline-block mb-10'>
                    <img
                        src='/lucky-logo.png'
                        alt='Lucky Bot'
                        className='h-24 w-24 mx-auto'
                        width='96'
                        height='96'
                        loading='eager'
                        fetchPriority='high'
                        decoding='async'
                    />
                </motion.div>

                {/* Display headline — Sora via --font-lucky-display global base rule */}
                <h1 className='mb-6 text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-[-0.03em]'>
                    <span className='block text-lucky-text-strong'>{t('landing.hero.headlineLine1')}</span>
                    <span className='block text-lucky-brand'>{t('landing.hero.headlineLine2')}</span>
                </h1>

                <p className='mb-10 mx-auto max-w-xl text-lg text-lucky-text-body leading-relaxed font-normal'>
                    {t('landing.hero.subtitle')}
                </p>

                <motion.div
                    className='flex flex-col sm:flex-row gap-3 justify-center'
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    <a
                        href={BOT_INVITE_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex h-12 items-center justify-center rounded-lg px-8 font-semibold text-white bg-lucky-brand hover:bg-lucky-brand-strong transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand focus-visible:ring-offset-2 focus-visible:ring-offset-lucky-surface-canvas active:scale-[0.98]'
                    >
                        {t('landing.hero.ctaPrimary')}
                    </a>
                    <Button
                        onClick={onLogin}
                        variant='secondary'
                        className='h-12 px-8 rounded-lg border border-lucky-border-strong bg-transparent text-lucky-text-body hover:bg-lucky-surface-panel hover:text-lucky-text-strong hover:border-lucky-border-strong transition-all duration-150 active:scale-[0.98]'
                    >
                        {t('landing.hero.ctaSecondary')}
                    </Button>
                </motion.div>
            </motion.div>
        </section>
    )
}

function FeatureSection() {
    const { t } = useTranslation()

    const features = useMemo(
        () => [
            { icon: Music, titleKey: 'landing.features.music.title', descKey: 'landing.features.music.description' },
            { icon: Shield, titleKey: 'landing.features.autoMod.title', descKey: 'landing.features.autoMod.description' },
            { icon: Zap, titleKey: 'landing.features.customCommands.title', descKey: 'landing.features.customCommands.description' },
            { icon: BarChart3, titleKey: 'landing.features.webDashboard.title', descKey: 'landing.features.webDashboard.description' },
            { icon: Palette, titleKey: 'landing.features.embedBuilder.title', descKey: 'landing.features.embedBuilder.description' },
            { icon: Sparkles, titleKey: 'landing.features.artistPreferences.title', descKey: 'landing.features.artistPreferences.description' },
        ],
        [],
    )

    return (
        <section className='bg-lucky-surface-canvas border-t border-lucky-border-soft px-4 py-24 md:px-8'>
            <div className='mx-auto max-w-6xl space-y-12'>
                <motion.div
                    className='text-center'
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    viewport={{ once: true }}
                >
                    <h2 className='text-4xl md:text-5xl font-bold mb-3 text-lucky-text-strong'>
                        {t('landing.features.heading')}
                    </h2>
                    <p className='text-lucky-text-body text-lg max-w-xl mx-auto'>{t('landing.features.subheading')}</p>
                </motion.div>

                <ul className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    {features.map((feature, idx) => {
                        const Icon = feature.icon
                        const span = FEATURE_SPANS[idx] ?? 1
                        const isLarge = span === 2
                        return (
                            <li key={feature.titleKey} className={isLarge ? 'md:col-span-2' : 'md:col-span-1'}>
                                <motion.article
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.45, delay: idx * 0.07, ease: [0.16, 1, 0.3, 1] }}
                                    viewport={{ once: true }}
                                    className='surface-panel h-full flex flex-col gap-4 p-6 md:p-7 group cursor-default'
                                >
                                    <div className='inline-flex w-fit rounded-lg bg-lucky-surface-elevated p-2.5 text-lucky-brand group-hover:bg-lucky-surface-highlight transition-colors duration-150'>
                                        <Icon size={isLarge ? 22 : 18} />
                                    </div>
                                    <div>
                                        <h3 className={`mb-1.5 font-semibold text-lucky-text-strong ${isLarge ? 'text-lg' : 'text-base'}`}>
                                            {t(feature.titleKey)}
                                        </h3>
                                        <p className='text-sm text-lucky-text-body leading-relaxed'>{t(feature.descKey)}</p>
                                    </div>
                                </motion.article>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </section>
    )
}

type StatsSectionProps = {
    statsLoading: boolean
    guildCount: number
    userCount: number
    serversOnline?: number
}

function StatsSection({ statsLoading, guildCount, userCount, serversOnline }: StatsSectionProps) {
    const { t, i18n } = useTranslation()
    const locale = i18n.resolvedLanguage ?? i18n.language
    const isOnline = Boolean(serversOnline)

    const scaleStats = [
        {
            icon: Server,
            value: statsLoading ? '—' : `${guildCount.toLocaleString(locale)}${guildCount > 0 ? '+' : ''}`,
            label: t('landing.stats.servers'),
            size: 'text-5xl md:text-6xl' as const,
        },
        {
            icon: Users,
            value: statsLoading ? '—' : `${userCount.toLocaleString(locale)}+`,
            label: t('landing.stats.users'),
            size: 'text-4xl md:text-5xl' as const,
        },
    ]

    return (
        <section className='bg-lucky-surface-sidebar border-y border-lucky-border-soft px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-4xl'>
                <div className='flex flex-col md:flex-row items-center justify-center gap-12 md:gap-16'>
                    {scaleStats.map(({ icon: Icon, value, label, size }, idx) => (
                        <motion.div
                            key={label}
                            className='text-center'
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.16, 1, 0.3, 1] }}
                            viewport={{ once: true }}
                        >
                            <p className={`font-black tabular-nums tracking-tight text-lucky-text-strong mb-1 ${size}`}>
                                {value}
                            </p>
                            <div className='flex items-center justify-center gap-1.5 text-lucky-text-muted text-xs font-semibold uppercase tracking-wider'>
                                <Icon size={12} />
                                <span>{label}</span>
                            </div>
                        </motion.div>
                    ))}

                    <div className='hidden md:block w-px h-16 bg-lucky-border-soft' aria-hidden />

                    {/* Status — distinct from scale metrics: badge-style, no large number */}
                    <motion.div
                        className='text-center'
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        viewport={{ once: true }}
                    >
                        {statsLoading ? (
                            <p className='text-3xl font-bold text-lucky-text-muted mb-1'>—</p>
                        ) : (
                            <div className='flex items-center justify-center gap-2 mb-1'>
                                <span
                                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${isOnline ? 'bg-lucky-success' : 'bg-lucky-text-muted'}`}
                                    style={isOnline ? { boxShadow: '0 0 0 3px rgb(35 165 90 / 0.2)' } : undefined}
                                />
                                <span className='text-2xl font-bold text-lucky-text-strong'>
                                    {isOnline ? t('landing.stats.statusOnline') : t('landing.stats.statusOffline')}
                                </span>
                            </div>
                        )}
                        <div className='flex items-center justify-center gap-1.5 text-lucky-text-muted text-xs font-semibold uppercase tracking-wider'>
                            <Radio size={12} />
                            <span>{t('landing.stats.status')}</span>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}

function FAQSection() {
    const { t } = useTranslation()
    const [openIdx, setOpenIdx] = useState<number | null>(null)

    const faqs = useMemo(() => {
        const faqKeys = ['free', 'commands', 'autoplay', 'selfHost', 'spam', 'support'] as const
        return faqKeys.map((key) => ({
            q: t(`landing.faq.items.${key}.question`),
            a: t(`landing.faq.items.${key}.answer`),
        }))
    }, [t])

    return (
        <section className='bg-lucky-surface-canvas px-4 py-24 md:px-8'>
            <div className='mx-auto max-w-2xl'>
                <motion.div
                    className='text-center mb-10'
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                >
                    <h2 className='text-4xl md:text-5xl font-bold text-lucky-text-strong'>{t('landing.faq.heading')}</h2>
                </motion.div>

                <div className='space-y-2'>
                    {faqs.map(({ q, a }, idx) => {
                        const isOpen = openIdx === idx
                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: idx * 0.04 }}
                                viewport={{ once: true }}
                                className={`rounded-lg border bg-lucky-surface-sidebar overflow-hidden transition-colors duration-150 ${
                                    isOpen ? 'border-lucky-brand' : 'border-lucky-border-soft hover:border-lucky-border-strong'
                                }`}
                            >
                                <button
                                    onClick={() => setOpenIdx(isOpen ? null : idx)}
                                    className='w-full px-5 py-4 flex items-center justify-between text-left hover:bg-lucky-surface-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand focus-visible:ring-inset'
                                    aria-expanded={isOpen}
                                >
                                    <span className='font-semibold text-lucky-text-strong pr-4'>{q}</span>
                                    <motion.div
                                        animate={{ rotate: isOpen ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={`shrink-0 transition-colors duration-150 ${isOpen ? 'text-lucky-brand' : 'text-lucky-text-muted'}`}
                                    >
                                        <ChevronDown size={18} />
                                    </motion.div>
                                </button>
                                <motion.div
                                    initial={false}
                                    animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                    className='overflow-hidden'
                                >
                                    <p className='px-5 pb-5 pt-1 text-sm text-lucky-text-body leading-relaxed border-t border-lucky-border-soft'>
                                        {a}
                                    </p>
                                </motion.div>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

function FooterSection() {
    const { t } = useTranslation()
    const footerLinks = [
        { href: '/terms', key: 'landing.footer.terms', external: false },
        { href: '/privacy', key: 'landing.footer.privacy', external: false },
        { href: 'https://github.com/LucasSantana-Dev/Lucky', key: 'landing.footer.github', external: true },
    ]

    return (
        <footer className='bg-lucky-surface-canvas border-t border-lucky-border-soft px-4 py-12 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-8 mb-8'>
                    <div className='space-y-3'>
                        <div className='flex items-center gap-2.5'>
                            <img src='/lucky-logo.png' alt='Lucky' className='h-7 w-7' loading='lazy' />
                            <span className='font-semibold text-lucky-text-strong'>Lucky</span>
                        </div>
                        <p className='text-sm text-lucky-text-muted'>{t('landing.footer.tagline')}</p>
                    </div>
                    <div>
                        <h4 className='text-xs font-semibold text-lucky-text-muted uppercase tracking-wider mb-4'>
                            {t('landing.footer.links')}
                        </h4>
                        <nav className='space-y-2.5'>
                            {footerLinks.map(({ href, key, external }) => (
                                <a
                                    key={key}
                                    href={href}
                                    {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                                    className='block text-sm text-lucky-text-muted hover:text-lucky-brand transition-colors duration-150'
                                >
                                    {t(key)}
                                </a>
                            ))}
                        </nav>
                    </div>
                    <div>
                        <h4 className='text-xs font-semibold text-lucky-text-muted uppercase tracking-wider mb-4'>
                            {t('landing.footer.support')}
                        </h4>
                        <p className='text-sm text-lucky-text-muted'>{t('landing.footer.supportCopy')}</p>
                    </div>
                </div>
                <div className='pt-8 border-t border-lucky-border-soft text-center'>
                    <p className='text-xs text-lucky-text-subtle'>{t('landing.footer.copyright')}</p>
                </div>
            </div>
        </footer>
    )
}
