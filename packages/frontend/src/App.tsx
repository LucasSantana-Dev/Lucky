import {
    Suspense,
    lazy,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useAuthStore } from './stores/authStore'
import { useGuildStore } from './stores/guildStore'
import Layout from './components/Layout/Layout'
import PageLoader from './components/ui/PageLoader'
import EmptyState from './components/ui/EmptyState'
import { hasModuleAccess } from './lib/rbac'
import type { ModuleKey } from './types'

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
const EmbedBuilderPage = lazy(() => import('./pages/EmbedBuilder'))
const ReactionRolesPage = lazy(() => import('./pages/ReactionRoles'))
const GuildAutomationPage = lazy(() => import('./pages/GuildAutomation'))
const LevelsPage = lazy(() => import('./pages/Levels'))
const StarboardPage = lazy(() => import('./pages/Starboard'))
const TrackHistoryPage = lazy(() => import('./pages/TrackHistory'))
const LyricsPage = lazy(() => import('./pages/Lyrics'))
const TwitchNotificationsPage = lazy(
    () => import('./pages/TwitchNotifications'),
)
const LastFmPage = lazy(() => import('./pages/LastFm'))
const TermsOfServicePage = lazy(() => import('./pages/TermsOfService'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicy'))

const LEGAL_PATHS = [
    '/terms-of-service',
    '/terms',
    '/privacy-policy',
    '/privacy',
]

function isLegalPath(pathname: string) {
    return LEGAL_PATHS.includes(pathname)
}

function ForbiddenModulePage({ module }: { module: ModuleKey }) {
    return (
        <EmptyState
            icon={<ShieldAlert className='h-10 w-10' />}
            title='Access denied'
            description={`You do not have permission to view the ${module} module for this server.`}
        />
    )
}

function RouteModuleGuard({
    module,
    children,
}: {
    module: ModuleKey
    children: ReactNode
}) {
    const { selectedGuild, memberContext, memberContextLoading } =
        useGuildStore()

    if (!selectedGuild) {
        return <>{children}</>
    }

    const fallbackAccess = selectedGuild.effectiveAccess

    if (memberContextLoading && !fallbackAccess) {
        return <PageLoader />
    }

    const effectiveAccess = memberContext?.effectiveAccess ?? fallbackAccess

    if (!hasModuleAccess(effectiveAccess, module, 'view')) {
        return <ForbiddenModulePage module={module} />
    }

    return <>{children}</>
}

function guardedRoute(module: ModuleKey, element: ReactNode) {
    return <RouteModuleGuard module={module}>{element}</RouteModuleGuard>
}

function AuthenticatedRoutes() {
    return (
        <Routes>
            <Route
                path='/'
                element={guardedRoute('overview', <DashboardPage />)}
            />
            <Route path='/servers' element={<ServersPage />} />
            <Route
                path='/features'
                element={guardedRoute('automation', <FeaturesPage />)}
            />
            <Route
                path='/config'
                element={guardedRoute('settings', <ConfigPage />)}
            />
            <Route
                path='/settings'
                element={guardedRoute('settings', <ServerSettingsPage />)}
            />
            <Route
                path='/moderation'
                element={guardedRoute('moderation', <ModerationPage />)}
            />
            <Route
                path='/automod'
                element={guardedRoute('moderation', <AutoModPage />)}
            />
            <Route
                path='/logs'
                element={guardedRoute('moderation', <ServerLogsPage />)}
            />
            <Route
                path='/commands'
                element={guardedRoute('automation', <CustomCommandsPage />)}
            />
            <Route
                path='/automessages'
                element={guardedRoute('automation', <AutoMessagesPage />)}
            />
            <Route
                path='/embed-builder'
                element={guardedRoute('automation', <EmbedBuilderPage />)}
            />
            <Route
                path='/reaction-roles'
                element={guardedRoute('automation', <ReactionRolesPage />)}
            />
            <Route
                path='/guild-automation'
                element={guardedRoute('automation', <GuildAutomationPage />)}
            />
            <Route
                path='/levels'
                element={guardedRoute('settings', <LevelsPage />)}
            />
            <Route
                path='/starboard'
                element={guardedRoute('settings', <StarboardPage />)}
            />
            <Route
                path='/music'
                element={guardedRoute('music', <MusicPage />)}
            />
            <Route
                path='/music/history'
                element={guardedRoute('music', <TrackHistoryPage />)}
            />
            <Route
                path='/lyrics'
                element={guardedRoute('music', <LyricsPage />)}
            />
            <Route
                path='/twitch'
                element={guardedRoute(
                    'integrations',
                    <TwitchNotificationsPage />,
                )}
            />
            <Route
                path='/lastfm'
                element={guardedRoute('integrations', <LastFmPage />)}
            />
            <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
    )
}

function LegalRoutes() {
    return (
        <Routes>
            <Route path='/terms-of-service' element={<TermsOfServicePage />} />
            <Route path='/terms' element={<TermsOfServicePage />} />
            <Route path='/privacy-policy' element={<PrivacyPolicyPage />} />
            <Route path='/privacy' element={<PrivacyPolicyPage />} />
            <Route
                path='*'
                element={<Navigate to='/terms-of-service' replace />}
            />
        </Routes>
    )
}

function App() {
    const location = useLocation()
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

    if (isLegalPath(location.pathname)) {
        return (
            <div className='dark'>
                <ErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                        <LegalRoutes />
                    </Suspense>
                </ErrorBoundary>
            </div>
        )
    }

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
