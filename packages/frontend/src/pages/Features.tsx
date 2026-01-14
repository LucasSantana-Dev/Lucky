import { useEffect } from 'react'
import { useFeatureStore } from '../stores/featureStore'
import { useGuildStore } from '../stores/guildStore'
import GlobalTogglesSection from '../components/Features/GlobalTogglesSection'
import ServerTogglesSection from '../components/Features/ServerTogglesSection'

function Features() {
  const { fetchFeatures, fetchGlobalToggles, fetchServerToggles, checkDeveloperStatus, isDeveloper } = useFeatureStore()
  const { selectedGuildId } = useGuildStore()

  useEffect(() => {
    fetchFeatures()
    checkDeveloperStatus()
  }, [fetchFeatures, checkDeveloperStatus])

  useEffect(() => {
    if (isDeveloper) {
      fetchGlobalToggles()
    }
  }, [isDeveloper, fetchGlobalToggles])

  useEffect(() => {
    if (selectedGuildId) {
      fetchServerToggles(selectedGuildId)
    }
  }, [selectedGuildId, fetchServerToggles])

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8">
      <h1 className="text-2xl md:text-3xl font-bold text-text-primary">Feature Management</h1>
      {isDeveloper && <GlobalTogglesSection />}
      <ServerTogglesSection />
    </div>
  )
}

export default Features
