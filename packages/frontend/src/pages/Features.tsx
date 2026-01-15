import { useEffect } from 'react'
import { Shield } from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'
import GlobalTogglesSection from '@/components/Features/GlobalTogglesSection'
import ServerTogglesSection from '@/components/Features/ServerTogglesSection'
import { useGuildStore } from '@/stores/guildStore'
import { useAuthStore } from '@/stores/authStore'
import { useFeaturesStore } from '@/stores/featuresStore'
import type { FeatureToggleName } from '@/types'

export default function FeaturesPage() {
    const { user } = useAuthStore()
    const { guilds, selectedGuild, selectGuild, fetchGuilds } = useGuildStore()
    const {
        globalToggles,
        isLoading,
        fetchFeatures,
        fetchGlobalToggles,
        fetchServerToggles,
        updateGlobalToggle,
        updateServerToggle,
        getServerToggles,
    } = useFeaturesStore()

    useEffect(() => {
        fetchGuilds()
        fetchFeatures()
        if (user?.isDeveloper) {
            fetchGlobalToggles()
        }
    }, [fetchGuilds, fetchFeatures, fetchGlobalToggles, user?.isDeveloper])

    useEffect(() => {
        if (selectedGuild) {
            fetchServerToggles(selectedGuild.id)
        }
    }, [selectedGuild, fetchServerToggles])

    const handleGlobalToggle = (name: FeatureToggleName, enabled: boolean) => {
        updateGlobalToggle(name, enabled)
    }

    const handleServerToggle = (name: FeatureToggleName, enabled: boolean) => {
        if (selectedGuild) {
            updateServerToggle(selectedGuild.id, name, enabled)
        }
    }

    const serverToggles = selectedGuild
        ? getServerToggles(selectedGuild.id)
        : globalToggles

    if (isLoading) {
        return (
            <div className='p-6 space-y-6'>
                <Skeleton className='h-10 w-48' />
                <div className='space-y-4'>
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className='h-24 w-full' />
                    ))}
                </div>
            </div>
        )
    }

    const isDeveloper = user?.isDeveloper

    return (
        <div className='p-4 md:p-6 space-y-8'>
            <div className='flex items-center gap-3'>
                <Shield className='w-7 h-7 text-lukbot-red' />
                <h1 className='text-2xl font-bold text-white'>Features</h1>
            </div>

            {isDeveloper && (
                <GlobalTogglesSection
                    toggles={globalToggles}
                    onToggle={handleGlobalToggle}
                />
            )}

            <ServerTogglesSection
                toggles={serverToggles}
                onToggle={handleServerToggle}
                selectedGuildId={selectedGuild?.id || null}
                onSelectGuild={(id) => {
                    const guild = guilds.find((g) => g.id === id) || null
                    selectGuild(guild)
                }}
            />
        </div>
    )
}
