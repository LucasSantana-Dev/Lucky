import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'

function Login() {
  const { checkAuth, isLoading } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('authenticated') === 'true') {
      checkAuth()
    }
  }, [checkAuth])

  const handleLogin = () => {
    window.location.href = '/api/auth/discord'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary px-4">
      <div className="text-center space-y-6 max-w-md w-full">
        <h1 className="text-3xl md:text-4xl font-bold text-text-primary">LukBot</h1>
        <p className="text-text-secondary">Discord Bot Management</p>
        <button
          onClick={handleLogin}
          className="w-full sm:w-auto px-6 py-3 bg-primary hover:bg-primary/90 text-text-primary rounded-lg font-medium transition-colors"
        >
          Login with Discord
        </button>
      </div>
    </div>
  )
}

export default Login
