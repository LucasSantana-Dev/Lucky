import { useFeatureStore } from '../../stores/featureStore'
import { useGuildStore } from '../../stores/guildStore'
import FeatureCard from './FeatureCard'

function ServerTogglesSection() {
  const { features, serverToggles, updateServerToggle, isLoading } = useFeatureStore()
  const { selectedGuildId, getSelectedGuild } = useGuildStore()
  const selectedGuild = getSelectedGuild()

  if (!selectedGuildId) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-text-primary">Server Toggles</h2>
        <p className="text-text-secondary">Select a server to manage its feature toggles</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Server Toggles</h2>
          <p className="text-text-secondary text-sm mt-1">
            Per-server feature toggles for: {selectedGuild?.name}
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
              enabled={serverToggles[feature.name] ?? false}
              onToggle={(enabled) => updateServerToggle(selectedGuildId, feature.name, enabled)}
              isGlobal={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ServerTogglesSection
