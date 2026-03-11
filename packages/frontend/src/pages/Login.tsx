import { Loader2, Sparkles, Zap, ShieldCheck } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { useAuthRedirect } from '@/hooks/useAuthRedirect'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function LoginPage() {
    const isLoading = useAuthStore((state) => state.isLoading)
    const login = useAuthStore((state) => state.login)

    useAuthRedirect()
    usePageMetadata({
        title: 'Login - Lucky',
        description: 'Login to Lucky Dashboard to manage your Discord servers',
    })

    return (
        <div className='lucky-shell relative min-h-screen overflow-hidden px-4 py-8 md:px-8'>
            <div className='mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]'>
                <section className='space-y-7'>
                    <div className='inline-flex items-center gap-2 rounded-full border border-lucky-border bg-lucky-bg-secondary/80 px-3 py-1'>
                        <Sparkles className='h-3.5 w-3.5 text-lucky-accent' />
                        <span className='type-body-sm text-lucky-text-secondary'>
                            Neo-editorial command center
                        </span>
                    </div>

                    <div className='space-y-3'>
                        <div className='flex items-center gap-3'>
                            <img
                                src='/lucky-logo.png'
                                alt='Lucky'
                                className='h-16 w-16 rounded-2xl object-cover ring-1 ring-lucky-border'
                            />
                            <div>
                                <h1 className='type-display text-lucky-text-primary'>Lucky</h1>
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
                        <div className='surface-panel px-4 py-4'>
                            <p className='type-h2 text-lucky-text-primary'>32+</p>
                            <p className='type-body-sm text-lucky-text-tertiary'>Modules</p>
                        </div>
                        <div className='surface-panel px-4 py-4'>
                            <p className='type-h2 text-lucky-text-primary'>100+</p>
                            <p className='type-body-sm text-lucky-text-tertiary'>Commands</p>
                        </div>
                        <div className='surface-panel px-4 py-4'>
                            <p className='type-h2 text-lucky-text-primary'>24/7</p>
                            <p className='type-body-sm text-lucky-text-tertiary'>Uptime</p>
                        </div>
                    </div>
                </section>

                <section className='surface-card space-y-6 p-6 md:p-8'>
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
                        className='lucky-focus-visible h-14 w-full rounded-xl bg-lucky-accent text-black hover:bg-lucky-accent-soft'
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className='mr-2 h-5 w-5 animate-spin' />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <svg className='mr-2 h-5 w-5' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z' />
                                </svg>
                                Login with Discord
                            </>
                        )}
                    </Button>

                    <div className='grid gap-3 sm:grid-cols-3'>
                        <div className='rounded-xl border border-lucky-border bg-lucky-bg-secondary/80 p-3'>
                            <ShieldCheck className='h-4 w-4 text-lucky-success' />
                            <p className='mt-2 type-body-sm text-lucky-text-primary'>OAuth secured</p>
                        </div>
                        <div className='rounded-xl border border-lucky-border bg-lucky-bg-secondary/80 p-3'>
                            <Zap className='h-4 w-4 text-lucky-accent' />
                            <p className='mt-2 type-body-sm text-lucky-text-primary'>Fast setup</p>
                        </div>
                        <div className='rounded-xl border border-lucky-border bg-lucky-bg-secondary/80 p-3'>
                            <Sparkles className='h-4 w-4 text-lucky-brand' />
                            <p className='mt-2 type-body-sm text-lucky-text-primary'>Live controls</p>
                        </div>
                    </div>
                </section>
            </div>

            <p className='pb-2 text-center type-body-sm text-lucky-text-disabled'>
                © 2026 Lucky. All rights reserved.
            </p>
        </div>
    )
}
