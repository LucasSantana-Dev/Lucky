import { Server } from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import FeatureCard from './FeatureCard'
import { useGuildStore } from '@/stores/guildStore'
import { useFeaturesStore } from '@/stores/featuresStore'
import type { FeatureToggleName, FeatureToggleState } from '@/types'

interface ServerTogglesSectionProps {
    toggles: FeatureToggleState
    onToggle: (name: FeatureToggleName, enabled: boolean) => void
    selectedGuildId: string | null
    onSelectGuild: (id: string | null) => void
}

export default function ServerTogglesSection({
    toggles,
    onToggle,
    selectedGuildId,
    onSelectGuild,
}: ServerTogglesSectionProps) {
    const guilds = useGuildStore((state) => state.guilds)
    const features = useFeaturesStore((state) => state.features)

    return (
        <div className='space-y-4'>
            <div className='flex items-center gap-2 mb-4'>
                <Server className='w-5 h-5 text-lukbot-blue' aria-hidden='true' />
                <h2 id='server-toggles-heading' className='text-lg font-semibold text-white'>
                    Server Toggles
                </h2>
            </div>

            <div className='mb-6'>
                <Select
                    value={selectedGuildId || ''}
                    onValueChange={(v: string) => onSelectGuild(v || null)}
                >
                    <SelectTrigger className='w-full max-w-xs bg-lukbot-bg-tertiary border-lukbot-border text-white'>
                        <SelectValue placeholder='Select a server...' />
                    </SelectTrigger>
                    <SelectContent className='bg-lukbot-bg-secondary border-lukbot-border'>
                        {guilds
                            .filter((g) => g.botAdded)
                            .map((guild) => (
                                <SelectItem key={guild.id} value={guild.id}>
                                    {guild.name}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            </div>

            {!selectedGuildId ? (
                <div className='bg-lukbot-bg-secondary rounded-xl p-8 border border-lukbot-border text-center'>
                    <Server className='w-10 h-10 text-lukbot-text-tertiary mx-auto mb-3' />
                    <p className='text-lukbot-text-secondary'>
                        Select a server to manage features
                    </p>
                </div>
            ) : (
                <div className='grid gap-4'>
                    {features.map((feature) => (
                        <FeatureCard
                            key={feature.name}
                            feature={feature}
                            enabled={toggles[feature.name] ?? false}
                            onToggle={(enabled) =>
                                onToggle(feature.name, enabled)
                            }
                            isGlobal={false}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
