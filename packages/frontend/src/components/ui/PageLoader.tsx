import { Loader2 } from 'lucide-react'

interface PageLoaderProps {
    message?: string
}

function PageLoader({ message = 'Loading...' }: PageLoaderProps) {
    return (
        <div className='min-h-screen bg-lucky-bg-primary flex items-center justify-center'>
            <div
                className='flex flex-col items-center gap-4'
                role='status'
                aria-label={message}
                aria-live='polite'
            >
                <Loader2 className='w-10 h-10 text-primary animate-spin' />
                <p className='text-lucky-text-secondary'>{message}</p>
            </div>
        </div>
    )
}

export default PageLoader
