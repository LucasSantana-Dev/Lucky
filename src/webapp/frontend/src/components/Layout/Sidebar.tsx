import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'

function Sidebar() {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/features', label: 'Features', icon: '⚙️' },
  ]

  return (
    <aside className="w-64 bg-bg-secondary border-r border-bg-border flex flex-col hidden md:flex">
      <div className="p-6 border-b border-bg-border">
        <h2 className="text-xl font-bold text-text-primary">LukBot</h2>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary text-text-primary'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export default Sidebar
