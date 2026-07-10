import {
    Suspense,
    lazy,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, Loader2 } from 'lucide-react'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useAuthStore } from './stores/authStore'
import { useGuildStore } from './stores/guildStore'
import Layout from './components/Layout/Layout'
import EmptyState from './components/ui/EmptyState'
import { hasModuleAccess } from './lib/rbac'
import type { AccessMode, ModuleKey } from './types'

// ponytail: inlined from PageLoader component for single-use
function PageLoader() {
    return (
        <div className='min-h-screen bg-lucky-bg-primary flex items-center justify-center'>
            <div
                className='flex flex-col items-center gap-4'
                role='status'
                aria-label='Loading...'
                aria-live='polite'
            >
                <Loader2 className='w-10 h-10 text-primary animate-spin' />
                <p className='text-lucky-text-secondary'>Loading...</p>
            </div>
        </div>
    )
}

const LandingPage = lazy(() => import('./pages/Landing'))
const LoginPage = lazy(() => import('./pages/Login'))
const ServersPage = lazy(() => import('./pages/ServersPage'))
const DashboardPage = lazy(() => import('./pages/DashboardOverview'))
const FeaturesPage = lazy(() => import('./pages/Features'))
const AdminPage = lazy(() => import('./pages/Admin'))
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
const PreferredArtistsPage = lazy(() => import('./pages/PreferredArtists'))
const TwitchNotificationsPage = lazy(
    () => import('./pages/TwitchNotifications'),
)
const RolesPage = lazy(() => import('./pages/Roles'))
const RoleGroupsPage = lazy(() => import('./pages/RoleGroups'))
const LastFmPage = lazy(() => import('./pages/LastFm'))
const SpotifyPage = lazy(() => import('./pages/Spotify'))
const BatchJobsPage = lazy(() => import('./pages/BatchJobs'))
const TermsOfServicePage = lazy(() => import('./pages/TermsOfService'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicy'))
const DocsPage = lazy(() => import('./pages/Docs'))
const ChangelogPage = lazy(() => import('./pages/Changelog'))
const SupportPage = lazy(() => import('./pages/Support'))
const AdminSupportPage = lazy(() => import('./pages/AdminSupport'))

const PUBLIC_PATH_PREFIXES = [
    '/terms-of-service',
    '/terms',
    '/privacy-policy',
    '/privacy',
    '/docs',
    '/changelog',
    '/support',
]

function isPublicPath(pathname: string) {
    return PUBLIC_PATH_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
}

function ForbiddenModulePage({ module }: { module: ModuleKey }) {
    const { t } = useTranslation()
    const moduleLabel = t(`modules.${module}`, { defaultValue: module })
    return (
        <EmptyState
            icon={<ShieldAlert className='h-10 w-10' />}
            title={t('common.accessDenied')}
            description={t('common.accessDeniedDescription', {
                module: moduleLabel,
            })}
        />
    )
}

function RouteModuleGuard({
    module,
    requiredMode = 'view',
    children,
}: {
    module: ModuleKey
    requiredMode?: AccessMode
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

    if (!hasModuleAccess(effectiveAccess, module, requiredMode)) {
        return <ForbiddenModulePage module={module} />
    }

    return <>{children}</>
}

function guardedRoute(
    module: ModuleKey,
    element: ReactNode,
    requiredMode: AccessMode = 'view',
) {
    return (
        <RouteModuleGuard module={module} requiredMode={requiredMode}>
            {element}
        </RouteModuleGuard>
    )
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
            <Route path='/admin' element={<AdminPage />} />
            <Route path='/admin/support' element={<AdminSupportPage />} />
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
                path='/role-groups'
                element={guardedRoute('automation', <RoleGroupsPage />)}
            />
            <Route
                path='/roles'
                element={guardedRoute('settings', <RolesPage />)}
            />
            <Route
                path='/guild-automation'
                element={guardedRoute(
                    'settings',
                    <GuildAutomationPage />,
                    'manage',
                )}
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
                path='/music/artists'
                element={guardedRoute('music', <PreferredArtistsPage />)}
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
            <Route
                path='/spotify'
                element={guardedRoute('integrations', <SpotifyPage />)}
            />
            <Route
                path='/batch-jobs'
                element={guardedRoute('moderation', <BatchJobsPage />)}
            />
            <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
    )
}

function PublicRoutes() {
    return (
        <Routes>
            <Route path='/terms-of-service' element={<TermsOfServicePage />} />
            <Route path='/terms' element={<TermsOfServicePage />} />
            <Route path='/privacy-policy' element={<PrivacyPolicyPage />} />
            <Route path='/privacy' element={<PrivacyPolicyPage />} />
            <Route path='/docs' element={<DocsPage />} />
            <Route path='/changelog' element={<ChangelogPage />} />
            <Route path='/support' element={<SupportPage />} />
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

    if (isPublicPath(location.pathname)) {
        return (
            <div className='dark'>
                <ErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                        <PublicRoutes />
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
                            <Route path='/' element={<LandingPage />} />
                            <Route path='/login' element={<LoginPage />} />
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
