import { useFeatureStore } from '../../stores/featureStore'
import FeatureCard from './FeatureCard'

function GlobalTogglesSection() {
  const { features, globalToggles, updateGlobalToggle, isLoading } = useFeatureStore()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Global Toggles</h2>
          <p className="text-text-secondary text-sm mt-1">
            System-wide toggles that affect all servers (Developer only)
          </p>
        </div>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-secondary border border-bg-border rounded-lg p-6 space-y-4">
              <div className="h-4 bg-bg-tertiary rounded animate-pulse w-3/4" />
              <div className="h-3 bg-bg-tertiary rounded animate-pulse w-full" />
              <div className="h-6 bg-bg-tertiary rounded animate-pulse w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <FeatureCard
              key={feature.name}
              feature={feature}
              enabled={globalToggles[feature.name] ?? false}
              onToggle={(enabled) => updateGlobalToggle(feature.name, enabled)}
              isGlobal
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default GlobalTogglesSection
