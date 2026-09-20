import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initSentry } from './lib/sentry'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { Toaster } from './components/ui/sonner'
import './lib/i18n'
import './index.css'

initSentry()

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 10,
            retry: 1,
        },
    },
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <App />
                    <Toaster />
                </BrowserRouter>
            </QueryClientProvider>
        </ErrorBoundary>
    </StrictMode>,
)
