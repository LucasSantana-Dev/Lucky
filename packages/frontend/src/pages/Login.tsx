import { Loader2, Sparkles, Zap, ShieldCheck } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import Button from '@/components/ui/Button'
import StatTile from '@/components/ui/StatTile'
import { useAuthStore } from '@/stores/authStore'
import { useAuthRedirect } from '@/hooks/useAuthRedirect'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function LoginPage() {
    const isLoading = useAuthStore((state) => state.isLoading)
    const login = useAuthStore((state) => state.login)
    const prefersReducedMotion = useReducedMotion()

    useAuthRedirect()
    usePageMetadata({
        title: 'Login - Lucky',
        description: 'Login to Lucky Dashboard to manage your Discord servers',
    })

    const sectionStyle = prefersReducedMotion
        ? {}
        : { animationFillMode: 'both' as const }

    const sectionClass = prefersReducedMotion
        ? 'space-y-7'
        : 'space-y-7 animate-[fade-up_0.4s_ease-out]'

    const cardClass = prefersReducedMotion
        ? 'surface-card space-y-6 p-6 md:p-8'
        : 'surface-card space-y-6 p-6 md:p-8 animate-[fade-up_0.4s_ease-out]'

    const cardStyle = prefersReducedMotion
        ? {}
        : { animationDelay: '100ms', animationFillMode: 'both' as const }

    return (
        <div className='lucky-shell relative min-h-screen overflow-hidden px-4 py-8 md:px-8'>
            <div className='mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]'>
                <section className={sectionClass} style={sectionStyle}>
                    <div className='inline-flex items-center gap-2 rounded-full border border-lucky-border bg-lucky-bg-secondary/80 px-3 py-1 shadow-[0_0_12px_rgb(212_160_23/0.1)]'>
                        <Sparkles className='h-3.5 w-3.5 text-lucky-accent' />
                        <span className='type-body-sm text-lucky-text-secondary'>
                            Neo-editorial command center
                        </span>
                    </div>

                    <div className='space-y-3'>
                        <div className='flex items-center gap-3'>
                            <div className='relative'>
                                <div className='absolute -inset-1 rounded-2xl bg-gradient-to-br from-purple-500/30 to-yellow-500/20 blur-md' aria-hidden='true' />
                                <img
                                    src='/lucky-logo.png'
                                    alt='Lucky'
                                    className='relative h-16 w-16 rounded-2xl object-cover ring-1 ring-lucky-border-strong'
                                />
                            </div>
                            <div>
                                <h1 className='type-display lucky-gradient-text'>Lucky</h1>
                                <p className='type-body text-lucky-text-secondary'>Discord Bot Management</p>
                            </div>
                        </div>

                        <h2 className='type-h2 text-lucky-text-primary'>Welcome to Lucky Dashboard</h2>
                        <p className='type-body max-w-xl text-lucky-text-secondary'>
                            Manage your Discord servers, configure bot features, and customize
                            commands all in one place.
                        </p>
                    </div>

                    <div className='grid gap-3 sm:grid-cols-3'>
                        <StatTile value='32+' label='Modules' tone='brand' />
                        <StatTile value='100+' label='Commands' tone='accent' />
                        <StatTile value='24/7' label='Uptime' tone='success' />
                    </div>
                </section>

                <section
                    className={cardClass}
                    style={cardStyle}
                >
                    <div className='space-y-2'>
                        <p className='type-meta text-lucky-text-tertiary'>Authentication</p>
                        <h3 className='type-h2 text-lucky-text-primary'>Secure Discord sign-in</h3>
                        <p className='type-body-sm text-lucky-text-secondary'>
                            Login keeps your guild permissions and bot controls tied to your
                            Discord account.
                        </p>
                    </div>

                    <Button
                        onClick={login}
                        disabled={isLoading}
                        variant='accent'
                        className='lucky-focus-visible h-14 w-full rounded-xl'
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className='h-5 w-5 animate-spin' />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <svg className='h-5 w-5' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z' />
                                </svg>
                                Login with Discord
                            </>
                        )}
                    </Button>

                    <div className='grid gap-3 sm:grid-cols-3'>
                        {[
                            { icon: ShieldCheck, color: 'text-lucky-success', glow: 'rgb(34_197_94/0.3)', label: 'OAuth secured' },
                            { icon: Zap, color: 'text-lucky-accent', glow: 'rgb(212_160_23/0.3)', label: 'Fast setup' },
                            { icon: Sparkles, color: 'text-lucky-brand', glow: 'rgb(139_92_246/0.3)', label: 'Live controls' },
                        ].map(({ icon: Icon, color, glow, label }) => (
                            <div
                                key={label}
                                className='group rounded-xl border border-lucky-border bg-lucky-bg-secondary/80 p-3 transition-all duration-200 hover:border-lucky-border-strong'
                            >
                                <Icon
                                    className={`h-4 w-4 ${color} transition-all duration-200 group-hover:drop-shadow-[0_0_6px_${glow}]`}
                                />
                                <p className='mt-2 type-body-sm text-lucky-text-primary'>{label}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <p className='pb-2 text-center type-body-sm text-lucky-text-disabled'>
                © 2026 Lucky. All rights reserved.
            </p>
        </div>
    )
}
