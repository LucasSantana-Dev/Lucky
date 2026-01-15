import { Component, ErrorInfo, ReactNode } from 'react'
import Button from './ui/Button'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className='flex items-center justify-center min-h-screen bg-lukbot-bg-primary'>
                    <div className='text-center space-y-4 p-6'>
                        <h1 className='text-2xl font-bold text-white'>
                            Something went wrong
                        </h1>
                        <p className='text-lukbot-text-secondary'>
                            {this.state.error?.message ||
                                'An unexpected error occurred'}
                        </p>
                        <Button
                            onClick={() => {
                                this.setState({ hasError: false, error: null })
                                window.location.reload()
                            }}
                            className='bg-lukbot-red hover:bg-lukbot-red/90'
                        >
                            Reload Page
                        </Button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
