import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout/Layout'
import PageLoader from './components/ui/PageLoader'

const LoginPage = lazy(() => import('./pages/Login'))
const ServersPage = lazy(() => import('./pages/ServersPage'))
const DashboardPage = lazy(() => import('./pages/DashboardOverview'))
const FeaturesPage = lazy(() => import('./pages/Features'))
const ConfigPage = lazy(() => import('./pages/Config'))
const ModerationPage = lazy(() => import('./pages/Moderation'))
const AutoModPage = lazy(() => import('./pages/AutoMod'))
const ServerLogsPage = lazy(() => import('./pages/ServerLogs'))
const MusicPage = lazy(() => import('./pages/Music'))
const ServerSettingsPage = lazy(() => import('./pages/ServerSettings'))
const CustomCommandsPage = lazy(() => import('./pages/CustomCommands'))
const AutoMessagesPage = lazy(() => import('./pages/AutoMessages'))
const TrackHistoryPage = lazy(() => import('./pages/TrackHistory'))
const LyricsPage = lazy(() => import('./pages/Lyrics'))
const TwitchNotificationsPage = lazy(
    () => import('./pages/TwitchNotifications'),
)
const LastFmPage = lazy(() => import('./pages/LastFm'))

function AuthenticatedRoutes() {
    return (
        <Routes>
            <Route path='/' element={<DashboardPage />} />
            <Route path='/servers' element={<ServersPage />} />
            <Route path='/features' element={<FeaturesPage />} />
            <Route path='/config' element={<ConfigPage />} />
            <Route path='/settings' element={<ServerSettingsPage />} />
            <Route path='/moderation' element={<ModerationPage />} />
            <Route path='/automod' element={<AutoModPage />} />
            <Route path='/logs' element={<ServerLogsPage />} />
            <Route path='/commands' element={<CustomCommandsPage />} />
            <Route path='/automessages' element={<AutoMessagesPage />} />
            <Route path='/music' element={<MusicPage />} />
            <Route path='/music/history' element={<TrackHistoryPage />} />
            <Route path='/lyrics' element={<LyricsPage />} />
            <Route path='/twitch' element={<TwitchNotificationsPage />} />
            <Route path='/lastfm' element={<LastFmPage />} />
            <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
    )
}

function App() {
    const { isAuthenticated, isLoading, checkAuth } = useAuthStore()
    const [isReady, setIsReady] = useState(false)
    const initialized = useRef(false)

    useEffect(() => {
        if (initialized.current) return
        initialized.current = true

        checkAuth()
            .then(() => setIsReady(true))
            .catch(() => setIsReady(true))
    }, [checkAuth])

    // Show loader while initializing
    if (!isReady || isLoading) {
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
