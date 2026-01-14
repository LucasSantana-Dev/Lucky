import { useEffect } from 'react'
import { useGuildStore } from '../stores/guildStore'
import ServerGrid from '../components/Dashboard/ServerGrid'

function Dashboard() {
  const { fetchGuilds } = useGuildStore()

  useEffect(() => {
    fetchGuilds()
  }, [fetchGuilds])

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold text-text-primary mb-4 md:mb-6">Dashboard</h1>
      <ServerGrid />
    </div>
  )
}

export default Dashboard
