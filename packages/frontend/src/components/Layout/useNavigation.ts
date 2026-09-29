import { useLocation } from 'react-router-dom'
import { useGuildStore } from '@/stores/guildStore'
import { hasModuleAccess } from '@/lib/rbac'
import { navSections } from './navConfig'
import type { AccessMode, ModuleKey } from '@/types'

// Every path known to the sidebar, used to resolve which nav item "owns" a
// given pathname when more than one item's path is a prefix of it (e.g.
// /music and /music/history both match /music/history).
const ALL_NAV_PATHS = navSections.flatMap((section) =>
    section.items.map((item) => item.path),
)

/**
 * Active-route and module-visibility logic shared by the sidebar's nav
 * sections. Split out of Sidebar.tsx (#1978) so permission branching has one
 * place to change rather than being interleaved with rendering.
 */
export function useNavigation() {
    const location = useLocation()
    const { selectedGuild, memberContext } = useGuildStore()

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/'
        if (location.pathname === path) return true
        if (!location.pathname.startsWith(path + '/')) return false

        // This item only matches as a prefix (a sub-route of `path`). It is
        // active unless some other known nav path is a longer, equally
        // valid match for the current pathname — that item is the more
        // specific owner of this route and should be the only one
        // highlighted (e.g. /music/history beats /music).
        const hasMoreSpecificMatch = ALL_NAV_PATHS.some((other) => {
            if (other === path || other === '/') return false
            if (other.length <= path.length) return false
            return (
                location.pathname === other ||
                location.pathname.startsWith(other + '/')
            )
        })
        return !hasMoreSpecificMatch
    }

    const effectiveAccess =
        memberContext?.effectiveAccess ?? selectedGuild?.effectiveAccess

    const canViewModule = (
        module: ModuleKey,
        requiredMode: AccessMode = 'view',
    ) => {
        if (!selectedGuild || !effectiveAccess) return true
        return hasModuleAccess(effectiveAccess, module, requiredMode)
    }

    return { isActive, canViewModule }
}
