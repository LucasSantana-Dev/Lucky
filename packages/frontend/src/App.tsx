import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout/Layout'

const LoginPage = lazy(() => import('./pages/Login'))
const ServersPage = lazy(() => import('./pages/ServersPage'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const FeaturesPage = lazy(() => import('./pages/Features'))

function PageLoader() {
    return (
        <div className='min-h-screen bg-bg-primary flex items-center justify-center'>
            <div className='flex flex-col items-center gap-4'>
                <Loader2 className='w-10 h-10 text-primary animate-spin' />
                <p className='text-text-secondary'>Loading...</p>
            </div>
        </div>
    )
}

function App() {
    const { isAuthenticated } = useAuthStore()

    if (!isAuthenticated) {
        return (
            <div className='dark'>
                <ErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            <Route path='/' element={<LoginPage />} />
                            <Route
                                path='*'
                                element={<Navigate to='/' replace />}
                            />
                        </Routes>
                    </Suspense>
                </ErrorBoundary>
            </div>
        )
    }

    return (
        <div className='dark'>
            <ErrorBoundary>
                <Layout>
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            <Route path='/' element={<DashboardPage />} />
                            <Route path='/servers' element={<ServersPage />} />
                            <Route
                                path='/features'
                                element={<FeaturesPage />}
                            />
                            <Route
                                path='*'
                                element={<Navigate to='/' replace />}
                            />
                        </Routes>
                    </Suspense>
                </Layout>
            </ErrorBoundary>
        </div>
    )
}

export default App
