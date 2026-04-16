import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import Button from '@/components/ui/Button'
import { useReducedMotion } from 'framer-motion'

const CLIENT_ID = '999088926074396732'
const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=8`

const HERO_GRADIENT = 'bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950'
const HERO_GRADIENT_ANIMATED = `${HERO_GRADIENT} bg-[length:200%_200%] animate-[gradient_15s_ease_infinite]`

export default function Landing() {
    const login = useAuthStore((state) => state.login)
    const prefersReducedMotion = useReducedMotion()

    usePageMetadata({
        title: 'Lucky — Discord Bot with Music, Moderation & Dashboard',
        description: 'The all-in-one Discord bot for your community. Music, moderation, custom commands, auto-mod, and a full web dashboard. Free forever.',
    })

    const containerClass = prefersReducedMotion ? HERO_GRADIENT : HERO_GRADIENT_ANIMATED

    return (
        <div className='lucky-shell min-h-screen dark text-white'>
            {/* Hero */}
            <section className={`min-h-screen flex items-center justify-center px-4 py-16 md:px-8 ${containerClass}`}>
                <div className='mx-auto max-w-4xl text-center space-y-8'>
                    <div>
                        <h1 className='type-display text-5xl md:text-6xl font-bold mb-4 text-white'>
                            The all-in-one Discord bot for your community
                        </h1>
                        <p className='type-body text-xl text-gray-300 max-w-2xl mx-auto'>
                            Music, moderation, custom commands, auto-mod, and a full web dashboard. Free forever.
                        </p>
                    </div>

                    <div className='flex flex-col sm:flex-row gap-4 justify-center'>
                        <Button
                            onClick={() => window.open(BOT_INVITE_URL, '_blank')}
                            variant='primary'
                            className='px-8 py-3 h-12 rounded-lg'
                        >
                            Add to Discord
                        </Button>
                        <Button
                            onClick={login}
                            variant='secondary'
                            className='px-8 py-3 h-12 rounded-lg'
                        >
                            Open Dashboard
                        </Button>
                    </div>
                </div>
            </section>

            {/* Feature Grid (Phase 3) */}
            <section className='bg-slate-900 px-4 py-20 md:px-8'>
                <div className='mx-auto max-w-6xl space-y-12'>
                    <div className='text-center'>
                        <h2 className='type-h1 text-4xl font-bold mb-4'>Powerful Features</h2>
                        <p className='type-body text-gray-300 text-lg'>Everything you need to manage your Discord server</p>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                        {/* Music */}
                        <div className='rounded-lg border border-lucky-border bg-slate-800/50 p-6 space-y-3 hover:bg-slate-800 transition-colors'>
                            <div className='text-4xl'>🎵</div>
                            <h3 className='type-h3 font-semibold'>Music</h3>
                            <p className='type-body-sm text-gray-300'>Spotify-powered autoplay with genre matching</p>
                        </div>

                        {/* Auto-mod */}
                        <div className='rounded-lg border border-lucky-border bg-slate-800/50 p-6 space-y-3 hover:bg-slate-800 transition-colors'>
                            <div className='text-4xl'>🛡️</div>
                            <h3 className='type-h3 font-semibold'>Auto-mod</h3>
                            <p className='type-body-sm text-gray-300'>Spam/caps/link filters with per-guild rules</p>
                        </div>

                        {/* Custom Commands */}
                        <div className='rounded-lg border border-lucky-border bg-slate-800/50 p-6 space-y-3 hover:bg-slate-800 transition-colors'>
                            <div className='text-4xl'>⚙️</div>
                            <h3 className='type-h3 font-semibold'>Custom Commands</h3>
                            <p className='type-body-sm text-gray-300'>User-defined responses with variable interpolation</p>
                        </div>

                        {/* Web Dashboard */}
                        <div className='rounded-lg border border-lucky-border bg-slate-800/50 p-6 space-y-3 hover:bg-slate-800 transition-colors'>
                            <div className='text-4xl'>📊</div>
                            <h3 className='type-h3 font-semibold'>Web Dashboard</h3>
                            <p className='type-body-sm text-gray-300'>Full control from your browser</p>
                        </div>

                        {/* Embed Builder */}
                        <div className='rounded-lg border border-lucky-border bg-slate-800/50 p-6 space-y-3 hover:bg-slate-800 transition-colors'>
                            <div className='text-4xl'>🎨</div>
                            <h3 className='type-h3 font-semibold'>Embed Builder</h3>
                            <p className='type-body-sm text-gray-300'>Rich embeds without JSON</p>
                        </div>

                        {/* Artist Preferences */}
                        <div className='rounded-lg border border-lucky-border bg-slate-800/50 p-6 space-y-3 hover:bg-slate-800 transition-colors'>
                            <div className='text-4xl'>⭐</div>
                            <h3 className='type-h3 font-semibold'>Artist Preferences</h3>
                            <p className='type-body-sm text-gray-300'>Tailor autoplay to your taste</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Strip (Phase 4 - Placeholder) */}
            <section className='bg-indigo-950 px-4 py-16 md:px-8'>
                <div className='mx-auto max-w-6xl'>
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-8 text-center'>
                        <div>
                            <p className='text-4xl font-bold text-indigo-300 mb-2'>50+</p>
                            <p className='text-gray-300'>Servers</p>
                        </div>
                        <div>
                            <p className='text-4xl font-bold text-indigo-300 mb-2'>10k+</p>
                            <p className='text-gray-300'>Tracks Played</p>
                        </div>
                        <div>
                            <p className='text-4xl font-bold text-indigo-300 mb-2'>99.9%</p>
                            <p className='text-gray-300'>Uptime</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ (Phase 5) */}
            <section className='bg-slate-900 px-4 py-20 md:px-8'>
                <div className='mx-auto max-w-3xl space-y-8'>
                    <div className='text-center mb-12'>
                        <h2 className='type-h1 text-4xl font-bold mb-2'>Frequently Asked Questions</h2>
                    </div>

                    <div className='space-y-4'>
                        {[
                            {
                                q: 'Is Lucky free?',
                                a: 'Yes, Lucky is completely free with no premium tier.',
                            },
                            {
                                q: 'What commands does Lucky support?',
                                a: 'Lucky supports 100+ commands across music, moderation, custom commands, and more.',
                            },
                            {
                                q: 'How does autoplay work?',
                                a: 'Autoplay uses Spotify to match similar songs based on artist preferences you set.',
                            },
                            {
                                q: 'Can I self-host Lucky?',
                                a: 'Lucky is hosted and managed by us. You cannot self-host the bot, but you can use the dashboard to configure it.',
                            },
                            {
                                q: 'How do I moderate spam?',
                                a: 'Configure auto-mod rules for spam, caps, links, and more in the dashboard.',
                            },
                            {
                                q: 'Where do I get support?',
                                a: 'Join our Discord support server or open an issue on GitHub.',
                            },
                        ].map(({ q, a }, idx) => (
                            <details key={idx} className='rounded-lg border border-lucky-border bg-slate-800/50 p-4 cursor-pointer group'>
                                <summary className='font-semibold flex items-center justify-between text-white'>
                                    {q}
                                    <span className='ml-2 text-indigo-400 group-open:rotate-180 transition-transform'>▼</span>
                                </summary>
                                <p className='mt-3 text-gray-300 text-sm'>{a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer (Phase 5) */}
            <footer className='bg-slate-950 border-t border-lucky-border px-4 py-12 md:px-8'>
                <div className='mx-auto max-w-6xl'>
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-8 mb-8'>
                        <div>
                            <h4 className='font-semibold mb-4'>Lucky</h4>
                            <p className='text-sm text-gray-400'>Discord bot with music, moderation, and more.</p>
                        </div>
                        <div>
                            <h4 className='font-semibold mb-4'>Links</h4>
                            <nav className='space-y-2'>
                                <a href='/terms' className='text-sm text-gray-400 hover:text-gray-200'>Terms of Service</a>
                                <a href='/privacy' className='text-sm text-gray-400 hover:text-gray-200 block'>Privacy Policy</a>
                                <a href='https://github.com/LucasSantana-Dev/Lucky' target='_blank' rel='noreferrer' className='text-sm text-gray-400 hover:text-gray-200 block'>GitHub</a>
                            </nav>
                        </div>
                        <div>
                            <h4 className='font-semibold mb-4'>Support</h4>
                            <p className='text-sm text-gray-400'>Need help? Join our Discord community.</p>
                        </div>
                    </div>
                    <div className='text-center pt-8 border-t border-lucky-border'>
                        <p className='text-xs text-gray-500'>© 2026 Lucky. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
