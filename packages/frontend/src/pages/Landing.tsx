import { useEffect, useState } from 'react'
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

// Neon glow backdrop gradients
const NEON_BACKDROP = 'bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950'

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

    const { value: guildCount } = useCountUp(stats?.totalGuilds ?? 0, {
        duration: 1500,
        delay: 300,
    })
    const { value: userCount } = useCountUp(stats?.totalUsers ?? 0, {
        duration: 1500,
        delay: 500,
    })

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await api.stats.getPublic()
                setStats(response.data)
            } catch (error) {
                console.error('Failed to fetch stats:', error)
            } finally {
                setStatsLoading(false)
            }
        }

        fetchStats()
    }, [])

    usePageMetadata({
        title: t('landing.meta.title'),
        description: t('landing.meta.description'),
    })

    const logoAnimation = prefersReducedMotion
        ? {}
        : {
              animate: { scale: [1, 1.03, 1] },
              transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          }

    return (
        <div className='lucky-shell min-h-screen dark text-white'>
            {/* Hero Section with Neon Logo */}
            <HeroSection logoAnimation={logoAnimation} onLogin={login} />

            {/* Feature Grid */}
            <FeatureSection />

            {/* Stats Strip */}
            <StatsSection statsLoading={statsLoading} guildCount={guildCount} userCount={userCount} serversOnline={stats?.serversOnline} />

            {/* FAQ */}
            <FAQSection />

            {/* Footer */}
            <FooterSection />
        </div>
    )
}

// Hero Section with Animated Logo
function HeroSection({ logoAnimation, onLogin }: { logoAnimation: any; onLogin: () => void }) {
    const prefersReducedMotion = useReducedMotion()
    const { t } = useTranslation()

    return (
        <section className={`min-h-screen flex items-center justify-center relative px-4 py-16 md:px-8 ${NEON_BACKDROP}`}>
            <div className='absolute top-4 right-4 z-20'>
                <LanguageSwitcher />
            </div>
            {/* Animated neon glow blobs */}
            {!prefersReducedMotion && (
                <>
                    <div
                        className='absolute top-20 left-10 w-96 h-96 rounded-full bg-pink-500/20 blur-3xl animate-pulse'
                        style={{ animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
                    />
                    <div
                        className='absolute bottom-32 right-20 w-80 h-80 rounded-full bg-orange-500/15 blur-3xl animate-pulse'
                        style={{ animation: 'pulse 5s cubic-bezier(0.4, 0, 0.6, 1) infinite 1s' }}
                    />
                </>
            )}

            <motion.div className='relative mx-auto max-w-4xl text-center space-y-8 z-10' initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
                {/* Logo */}
                <motion.div {...logoAnimation} className='inline-block'>
                    <img
                        src='/lucky-logo.png'
                        alt='Lucky Bot'
                        className='h-32 w-32 mx-auto drop-shadow-2xl filter saturate-150'
                        loading='lazy'
                    />
                </motion.div>

                {/* Headline with gradient text */}
                <div className='space-y-4'>
                    <h1 className='text-5xl md:text-7xl font-bold leading-tight'>
                        <span className='block text-white'>{t('landing.hero.headlineLine1')}</span>
                        <span className='block bg-gradient-to-r from-pink-500 to-orange-400 bg-clip-text text-transparent'>{t('landing.hero.headlineLine2')}</span>
                    </h1>
                    <p className='text-lg md:text-xl text-gray-300 max-w-2xl mx-auto font-light'>
                        {t('landing.hero.subtitle')}
                    </p>
                </div>

                {/* CTA Buttons */}
                <motion.div
                    className='flex flex-col sm:flex-row gap-4 justify-center pt-4'
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                >
                    <Button
                        onClick={() => window.open(BOT_INVITE_URL, '_blank')}
                        variant='primary'
                        className='px-8 py-3 h-12 rounded-lg bg-gradient-to-r from-pink-500 to-orange-400 text-white font-semibold hover:shadow-lg hover:shadow-pink-500/50 transition-all duration-300 border-0'
                    >
                        {t('landing.hero.ctaPrimary')}
                    </Button>
                    <Button
                        onClick={onLogin}
                        variant='secondary'
                        className='px-8 py-3 h-12 rounded-lg border-2 border-pink-500/50 text-white hover:bg-pink-500/10 hover:border-pink-500 transition-all duration-300'
                    >
                        {t('landing.hero.ctaSecondary')}
                    </Button>
                </motion.div>
            </motion.div>
        </section>
    )
}

// Feature Grid with Neon Icon Orbs
function FeatureSection() {
    const prefersReducedMotion = useReducedMotion()
    const { t } = useTranslation()

    const features = [
        {
            icon: Music,
            titleKey: 'landing.features.music.title',
            descKey: 'landing.features.music.description',
            color: 'from-pink-500/20 to-pink-600/10',
            iconColor: 'text-pink-400',
        },
        {
            icon: Shield,
            titleKey: 'landing.features.autoMod.title',
            descKey: 'landing.features.autoMod.description',
            color: 'from-orange-500/20 to-orange-600/10',
            iconColor: 'text-orange-400',
        },
        {
            icon: Zap,
            titleKey: 'landing.features.customCommands.title',
            descKey: 'landing.features.customCommands.description',
            color: 'from-purple-500/20 to-purple-600/10',
            iconColor: 'text-purple-400',
        },
        {
            icon: BarChart3,
            titleKey: 'landing.features.webDashboard.title',
            descKey: 'landing.features.webDashboard.description',
            color: 'from-blue-500/20 to-blue-600/10',
            iconColor: 'text-blue-400',
        },
        {
            icon: Palette,
            titleKey: 'landing.features.embedBuilder.title',
            descKey: 'landing.features.embedBuilder.description',
            color: 'from-cyan-500/20 to-cyan-600/10',
            iconColor: 'text-cyan-400',
        },
        {
            icon: Sparkles,
            titleKey: 'landing.features.artistPreferences.title',
            descKey: 'landing.features.artistPreferences.description',
            color: 'from-amber-500/20 to-amber-600/10',
            iconColor: 'text-amber-400',
        },
    ]

    return (
        <section className='bg-gradient-to-b from-slate-900 to-slate-950 px-4 py-20 md:px-8 relative overflow-hidden'>
            {/* Subtle grid pattern background */}
            <div className='absolute inset-0 opacity-5 pointer-events-none' style={{
                backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(255,255,255,.1) 25%, rgba(255,255,255,.1) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.1) 75%, rgba(255,255,255,.1) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255,255,255,.1) 25%, rgba(255,255,255,.1) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.1) 75%, rgba(255,255,255,.1) 76%, transparent 77%, transparent)',
                backgroundSize: '50px 50px'
            }} />

            <div className='relative mx-auto max-w-6xl space-y-12'>
                <motion.div className='text-center' initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} viewport={{ once: true }}>
                    <h2 className='text-4xl md:text-5xl font-bold mb-4'>{t('landing.features.heading')}</h2>
                    <p className='text-gray-300 text-lg'>{t('landing.features.subheading')}</p>
                </motion.div>

                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                    {features.map((feature, idx) => {
                        const Icon = feature.icon
                        return (
                            <motion.div
                                key={feature.titleKey}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: idx * 0.1 }}
                                viewport={{ once: true }}
                                whileHover={prefersReducedMotion ? {} : { y: -4 }}
                                className={`rounded-xl border border-white/10 bg-gradient-to-br ${feature.color} backdrop-blur-sm p-6 space-y-4 hover:border-white/20 transition-all duration-300 group cursor-pointer`}
                            >
                                <div className={`inline-flex p-3 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors ${feature.iconColor}`}>
                                    <Icon size={24} />
                                </div>
                                <div>
                                    <h3 className='text-xl font-semibold text-white mb-2'>{t(feature.titleKey)}</h3>
                                    <p className='text-gray-300 text-sm'>{t(feature.descKey)}</p>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

// Stats Strip with Neon Numbers
function StatsSection({ statsLoading, guildCount, userCount, serversOnline }: any) {
    const { t } = useTranslation()
    const stats = [
        {
            label: t('landing.stats.servers'),
            value: statsLoading ? '---' : `${guildCount.toLocaleString()}${guildCount > 0 ? '+' : ''}`,
            icon: Server,
        },
        {
            label: t('landing.stats.users'),
            value: statsLoading ? '---' : `${userCount.toLocaleString()}+`,
            icon: Users,
        },
        {
            label: t('landing.stats.status'),
            value: serversOnline ? t('landing.stats.statusOnline') : statsLoading ? '---' : t('landing.stats.statusOffline'),
            icon: Radio,
            isStatus: true,
        },
    ]

    return (
        <section className='bg-gradient-to-r from-slate-950 via-purple-950/30 to-slate-950 px-4 py-16 md:px-8 border-y border-white/10 relative'>
            <div className='mx-auto max-w-6xl'>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
                    {stats.map((stat, idx) => {
                        const Icon = stat.icon
                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: idx * 0.15 }}
                                viewport={{ once: true }}
                                className='text-center group'
                            >
                                <div className='inline-flex p-3 rounded-lg bg-white/5 group-hover:bg-white/10 mb-4 text-pink-400 transition-colors'>
                                    <Icon size={20} />
                                </div>
                                <motion.p
                                    className='font-mono text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-400 to-orange-400 bg-clip-text text-transparent mb-2'
                                    initial={{ opacity: 0 }}
                                    whileInView={{ opacity: 1 }}
                                    transition={{ delay: idx * 0.15 + 0.2 }}
                                    viewport={{ once: true }}
                                >
                                    {stat.value}
                                </motion.p>
                                <p className='text-gray-300 text-sm uppercase tracking-wider'>{stat.label}</p>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

// FAQ Section with Smooth Accordions
function FAQSection() {
    const { t } = useTranslation()
    const [openIdx, setOpenIdx] = useState<number | null>(null)

    const faqKeys = ['free', 'commands', 'autoplay', 'selfHost', 'spam', 'support'] as const
    const faqs = faqKeys.map((key) => ({
        q: t(`landing.faq.items.${key}.question`),
        a: t(`landing.faq.items.${key}.answer`),
    }))

    return (
        <section className='bg-gradient-to-b from-slate-950 to-slate-900 px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-3xl space-y-8'>
                <motion.div className='text-center mb-12' initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} viewport={{ once: true }}>
                    <h2 className='text-4xl md:text-5xl font-bold mb-2'>{t('landing.faq.heading')}</h2>
                </motion.div>

                <div className='space-y-3'>
                    {faqs.map(({ q, a }, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: idx * 0.05 }}
                            viewport={{ once: true }}
                            className='rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden hover:border-pink-500/30 transition-all duration-300'
                        >
                            <button
                                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                                className='w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors duration-200'
                            >
                                <span className='font-semibold text-white'>{q}</span>
                                <motion.div
                                    animate={{ rotate: openIdx === idx ? 180 : 0 }}
                                    transition={{ duration: 0.3 }}
                                    className='text-pink-400 flex-shrink-0'
                                >
                                    <ChevronDown size={20} />
                                </motion.div>
                            </button>
                            <motion.div
                                initial={false}
                                animate={{
                                    height: openIdx === idx ? 'auto' : 0,
                                    opacity: openIdx === idx ? 1 : 0,
                                }}
                                transition={{ duration: 0.3 }}
                                className='overflow-hidden'
                            >
                                <p className='px-6 py-4 text-gray-300 text-sm border-t border-white/10'>{a}</p>
                            </motion.div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

// Footer with Logo Tile
function FooterSection() {
    const { t } = useTranslation()
    return (
        <footer className='bg-slate-950 border-t border-white/10 px-4 py-12 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-8 mb-8'>
                    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} viewport={{ once: true }} className='space-y-3'>
                        <div className='flex items-center gap-3'>
                            <img src='/lucky-logo.png' alt='Lucky' className='h-8 w-8' loading='lazy' />
                            <h4 className='font-semibold text-lg'>Lucky</h4>
                        </div>
                        <p className='text-sm text-gray-400'>{t('landing.footer.tagline')}</p>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} viewport={{ once: true }}>
                        <h4 className='font-semibold mb-4'>{t('landing.footer.links')}</h4>
                        <nav className='space-y-2'>
                            <a href='/terms' className='text-sm text-gray-400 hover:text-pink-400 transition-colors block'>
                                {t('landing.footer.terms')}
                            </a>
                            <a href='/privacy' className='text-sm text-gray-400 hover:text-pink-400 transition-colors block'>
                                {t('landing.footer.privacy')}
                            </a>
                            <a href='https://github.com/LucasSantana-Dev/Lucky' target='_blank' rel='noreferrer' className='text-sm text-gray-400 hover:text-pink-400 transition-colors block'>
                                {t('landing.footer.github')}
                            </a>
                        </nav>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} viewport={{ once: true }}>
                        <h4 className='font-semibold mb-4'>{t('landing.footer.support')}</h4>
                        <p className='text-sm text-gray-400'>{t('landing.footer.supportCopy')}</p>
                    </motion.div>
                </div>
                <motion.div className='text-center pt-8 border-t border-white/10' initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }} viewport={{ once: true }}>
                    <p className='text-xs text-gray-500'>{t('landing.footer.copyright')}</p>
                </motion.div>
            </div>
        </footer>
    )
}
