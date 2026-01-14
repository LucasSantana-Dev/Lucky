export interface User {
  id: string
  username: string
  discriminator: string
  avatar: string | null
}

export interface AuthStatus {
  authenticated: boolean
  user?: User
}
