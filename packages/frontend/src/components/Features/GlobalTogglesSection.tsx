import { Globe } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import FeatureCard from './FeatureCard'
import { useFeaturesStore } from '@/stores/featuresStore'
import type { FeatureToggleName, FeatureToggleState } from '@/types'

interface GlobalTogglesSectionProps {
    toggles: FeatureToggleState
    onToggle: (name: FeatureToggleName, enabled: boolean) => void
}

export default function GlobalTogglesSection({
    toggles,
    onToggle,
}: GlobalTogglesSectionProps) {
    const features = useFeaturesStore((state) => state.features)

    return (
        <div className='space-y-4'>
            <div className='flex items-center gap-2 mb-4'>
                <Globe className='w-5 h-5 text-lukbot-purple' aria-hidden='true' />
                <h2 id='global-toggles-heading' className='text-lg font-semibold text-white'>
                    Global Toggles
                </h2>
                <Badge className='bg-lukbot-purple/20 text-lukbot-purple text-xs'>
                    Developer Only
                </Badge>
            </div>
            <p className='text-sm text-lukbot-text-secondary mb-4'>
                These toggles affect all servers using the bot. Only developers
                can modify these.
            </p>
            <div className='grid gap-4'>
                {features.map((feature) => (
                    <FeatureCard
                        key={feature.name}
                        feature={feature}
                        enabled={toggles[feature.name] ?? false}
                        onToggle={(enabled) => onToggle(feature.name, enabled)}
                        isGlobal
                    />
                ))}
            </div>
        </div>
    )
}
