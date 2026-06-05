import { Component, ErrorInfo, ReactNode } from 'react'
import Button from './ui/Button'
import { captureFrontendException } from '@/lib/sentry'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
    correlationId: string | null
}

/** Short, URL-safe id so a crashed session maps to a report and a logged error. */
function mintCorrelationId(): string {
    try {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    } catch {
        return Math.random().toString(36).slice(2, 10)
    }
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null, correlationId: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, correlationId: mintCorrelationId() }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo)
        captureFrontendException(error, {
            correlationId: this.state.correlationId,
            componentStack: errorInfo.componentStack,
        })
    }

    render() {
        if (this.state.hasError) {
            const cid = this.state.correlationId
            const reportHref = `/support?category=web-error${
                cid ? `&cid=${encodeURIComponent(cid)}` : ''
            }`
            return (
                <div className='flex items-center justify-center min-h-screen bg-lucky-bg-primary'>
                    <div className='text-center space-y-4 p-6'>
                        <h1 className='text-2xl font-bold text-white'>
                            Something went wrong
                        </h1>
                        <p className='text-lucky-text-secondary'>
                            {this.state.error?.message ||
                                'An unexpected error occurred'}
                        </p>
                        {cid && (
                            <p className='text-sm text-lucky-text-tertiary'>
                                Error ID: <code>{cid}</code>
                            </p>
                        )}
                        <div className='flex items-center justify-center gap-3'>
                            <Button
                                onClick={() => {
                                    this.setState({
                                        hasError: false,
                                        error: null,
                                        correlationId: null,
                                    })
                                    window.location.reload()
                                }}
                                className='bg-lucky-red hover:bg-lucky-red/90'
                            >
                                Reload Page
                            </Button>
                            <a
                                href={reportHref}
                                className='inline-flex items-center justify-center rounded-lg border border-lucky-border px-4 py-2 text-sm text-lucky-text-secondary hover:text-lucky-text-primary hover:border-lucky-text-tertiary transition-colors'
                            >
                                Report this problem
                            </a>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
