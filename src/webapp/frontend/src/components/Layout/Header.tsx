import { useAuthStore } from '../../stores/authStore'
import ServerSelector from './ServerSelector'

function Header() {
  const { user, logout } = useAuthStore()

  const handleLogout = async () => {
    if (confirm('Are you sure you want to logout?')) {
      await logout()
    }
  }

  return (
    <header className="h-16 bg-bg-secondary border-b border-bg-border flex items-center justify-between px-4 md:px-6">
      <div className="flex-1">
        <ServerSelector />
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        {user && (
          <div className="hidden sm:flex items-center gap-3">
            {user.avatar && (
              <img
                src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                alt={user.username}
                className="w-8 h-8 rounded-full"
              />
            )}
            <span className="text-text-primary hidden md:inline">{user.username}</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="px-3 md:px-4 py-2 bg-bg-tertiary hover:bg-bg-active text-text-primary rounded-lg transition-colors text-sm md:text-base"
        >
          Logout
        </button>
      </div>
    </header>
  )
}

export default Header
