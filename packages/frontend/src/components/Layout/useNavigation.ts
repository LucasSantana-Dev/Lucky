import { useLocation } from 'react-router-dom'
import { useGuildStore } from '@/stores/guildStore'
import { hasModuleAccess } from '@/lib/rbac'
import type { AccessMode, ModuleKey } from '@/types'

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
        const exact = location.pathname === path
        const withChild = location.pathname.startsWith(path + '/')
        if (path === '/music' && location.pathname === '/music/artists') {
            return false
        }
        return exact || withChild
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
