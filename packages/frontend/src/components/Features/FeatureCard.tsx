import { useState } from 'react'
import type { Feature } from '../../types/feature'
import { cn } from '../../lib/utils'
import { useToast } from '../ui/Toast'

interface FeatureCardProps {
  feature: Feature
  enabled: boolean
  onToggle: (enabled: boolean) => void
  isGlobal: boolean
}

function FeatureCard({ feature, enabled, onToggle, isGlobal }: FeatureCardProps) {
  const [isToggling, setIsToggling] = useState(false)
  const { showToast } = useToast()

  const handleToggle = async () => {
    setIsToggling(true)
    try {
      await onToggle(!enabled)
      showToast(`${feature.name} ${!enabled ? 'enabled' : 'disabled'}`, 'success')
    } catch {
      showToast(`Failed to update ${feature.name}`, 'error')
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <div className="bg-bg-secondary border border-bg-border rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold text-text-primary">{feature.name}</h3>
            <span
              className={cn(
                'px-2 py-1 rounded text-xs',
                isGlobal ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400',
              )}
            >
              {isGlobal ? 'Global' : 'Per-Server'}
            </span>
          </div>
          <p className="text-text-secondary text-sm">{feature.description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-bg-border">
        <span className="text-text-secondary text-sm">
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
        <button
          onClick={handleToggle}
          disabled={isToggling}
          className={cn(
            'relative w-12 h-6 rounded-full transition-colors',
            enabled ? 'bg-primary' : 'bg-bg-tertiary',
            'disabled:opacity-50',
          )}
        >
          <span
            className={cn(
              'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    </div>
  )
}

export default FeatureCard
