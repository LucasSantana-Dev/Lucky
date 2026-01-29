import { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout/Layout'
import PageLoader from './components/ui/PageLoader'

const LoginPage = lazy(() => import('./pages/Login'))
const ServersPage = lazy(() => import('./pages/ServersPage'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const FeaturesPage = lazy(() => import('./pages/Features'))
const ConfigPage = lazy(() => import('./pages/Config'))

function AuthenticatedRoutes() {
    return (
        <Routes>
            <Route path='/' element={<DashboardPage />} />
            <Route path='/servers' element={<ServersPage />} />
            <Route path='/features' element={<FeaturesPage />} />
            <Route path='/config' element={<ConfigPage />} />
            <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
    )
}

function App() {
    const { isAuthenticated, isLoading, checkAuth } = useAuthStore()
    const [isInitializing, setIsInitializing] = useState(true)

    useEffect(() => {
        let isMounted = true
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        const initializeAuth = async () => {
            try {
                await checkAuth()
            } catch (error) {
                console.error('Failed to initialize auth:', error)
            } finally {
                if (isMounted) {
                    setIsInitializing(false)
                }
            }
        }

        initializeAuth()

        timeoutId = setTimeout(() => {
            if (isMounted) {
                console.warn(
                    'Auth initialization taking longer than expected - proceeding anyway',
                )
                setIsInitializing(false)
            }
        }, 30000)

        return () => {
            isMounted = false
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
        }
    }, [checkAuth])

    if (isInitializing || isLoading) {
        return (
            <div className='dark'>
                <PageLoader />
            </div>
        )
    }

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
                        <AuthenticatedRoutes />
                    </Suspense>
                </Layout>
            </ErrorBoundary>
        </div>
    )
}

export default App
