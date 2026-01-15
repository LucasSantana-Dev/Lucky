import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Feature } from '@/types'
import { cn } from '@/lib/utils'

interface FeatureCardProps {
    feature: Feature
    enabled: boolean
    onToggle: (enabled: boolean) => void
    isGlobal?: boolean
}

const formatFeatureName = (name: string): string => {
    return name
        .split('_')
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(' ')
}

export default function FeatureCard({
    feature,
    enabled,
    onToggle,
    isGlobal = false,
}: FeatureCardProps) {
    const [isUpdating, setIsUpdating] = useState(false)

    const handleToggle = async (checked: boolean) => {
        setIsUpdating(true)
        try {
            await onToggle(checked)
            toast.success(
                `${formatFeatureName(feature.name)} ${checked ? 'enabled' : 'disabled'}`,
            )
        } catch {
            toast.error(`Failed to update ${formatFeatureName(feature.name)}`)
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <div className='bg-lukbot-bg-secondary rounded-xl p-5 border border-lukbot-border'>
            <div className='flex items-start justify-between gap-4'>
                <div className='flex-1'>
                    <div className='flex items-center gap-2 mb-1'>
                        <h3 className='font-semibold text-white'>
                            {formatFeatureName(feature.name)}
                        </h3>
                        <Badge
                            className={cn(
                                'text-xs',
                                isGlobal
                                    ? 'bg-lukbot-purple/20 text-lukbot-purple'
                                    : 'bg-lukbot-blue/20 text-lukbot-blue',
                            )}
                        >
                            {isGlobal ? 'Global' : 'Per-Server'}
                        </Badge>
                    </div>
                    <p className='text-sm text-lukbot-text-secondary'>
                        {feature.description}
                    </p>
                </div>
                <div className='flex items-center gap-3'>
                    <span
                        className={cn(
                            'text-sm',
                            enabled
                                ? 'text-lukbot-success'
                                : 'text-lukbot-text-tertiary',
                        )}
                    >
                        {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <Switch
                        checked={enabled}
                        onCheckedChange={handleToggle}
                        disabled={isUpdating}
                    />
                </div>
            </div>
        </div>
    )
}
