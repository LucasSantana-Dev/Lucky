import { Bot, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { useAuthRedirect } from '@/hooks/useAuthRedirect'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function LoginPage() {
    const isLoading = useAuthStore((state) => state.isLoading)
    const login = useAuthStore((state) => state.login)
    useAuthRedirect()
    usePageMetadata({
        title: 'Login - LukBot',
        description: 'Login to LukBot Dashboard to manage your Discord servers',
    })

    const handleLogin = () => {
        login()
    }

    return (
        <div className='min-h-screen bg-lukbot-bg-primary flex flex-col items-center justify-center p-4 relative overflow-hidden'>
            <div className='absolute inset-0 bg-gradient-to-br from-lukbot-red/5 via-transparent to-lukbot-purple/5' />

            <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-lukbot-red/10 rounded-full blur-3xl animate-pulse-glow' />
            <div
                className='absolute bottom-1/4 right-1/4 w-96 h-96 bg-lukbot-purple/10 rounded-full blur-3xl animate-pulse-glow'
                style={{ animationDelay: '1s' }}
            />

            <div className='relative z-10 flex flex-col items-center text-center space-y-8'>
                <div className='flex items-center gap-3'>
                    <div className='relative'>
                        <div className='w-16 h-16 bg-lukbot-red rounded-xl flex items-center justify-center shadow-lg shadow-lukbot-red/30'>
                            <Bot className='w-10 h-10 text-white' />
                        </div>
                        <div className='absolute -top-1 -right-1 w-4 h-4 bg-lukbot-success rounded-full border-2 border-lukbot-bg-primary' />
                    </div>
                    <div className='text-left'>
                        <h1 className='text-4xl font-bold text-white tracking-tight'>
                            LukBot
                        </h1>
                        <p className='text-lukbot-text-secondary text-sm'>
                            Discord Bot Management
                        </p>
                    </div>
                </div>

                <div className='max-w-md space-y-2'>
                    <h2 className='text-xl font-semibold text-white'>
                        Welcome to LukBot Dashboard
                    </h2>
                    <p className='text-lukbot-text-secondary'>
                        Manage your Discord servers, configure bot features, and
                        customize commands all in one place.
                    </p>
                </div>


                <Button
                    onClick={handleLogin}
                    disabled={isLoading}
                    className='bg-lukbot-red hover:bg-lukbot-red/90 text-white px-8 py-6 text-lg font-semibold rounded-lg shadow-lg shadow-lukbot-red/30 transition-all hover:shadow-xl hover:shadow-lukbot-red/40 disabled:opacity-50'
                >
                    {isLoading ? (
                        <>
                            <Loader2 className='w-5 h-5 mr-2 animate-spin' />
                            Connecting...
                        </>
                    ) : (
                        <>
                            <svg
                                className='w-5 h-5 mr-2'
                                viewBox='0 0 24 24'
                                fill='currentColor'
                            >
                                <path d='M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z' />
                            </svg>
                            Login with Discord
                        </>
                    )}
                </Button>

                <div className='grid grid-cols-3 gap-4 mt-8 text-center'>
                    <div className='p-4 bg-lukbot-bg-secondary/50 rounded-lg border border-lukbot-border'>
                        <div className='text-2xl font-bold text-white'>32+</div>
                        <div className='text-xs text-lukbot-text-tertiary'>
                            Modules
                        </div>
                    </div>
                    <div className='p-4 bg-lukbot-bg-secondary/50 rounded-lg border border-lukbot-border'>
                        <div className='text-2xl font-bold text-white'>
                            100+
                        </div>
                        <div className='text-xs text-lukbot-text-tertiary'>
                            Commands
                        </div>
                    </div>
                    <div className='p-4 bg-lukbot-bg-secondary/50 rounded-lg border border-lukbot-border'>
                        <div className='text-2xl font-bold text-white'>
                            24/7
                        </div>
                        <div className='text-xs text-lukbot-text-tertiary'>
                            Uptime
                        </div>
                    </div>
                </div>
            </div>

            <div className='absolute bottom-4 text-center text-lukbot-text-disabled text-sm'>
                © 2026 LukBot. All rights reserved.
            </div>
        </div>
    )
}
