export interface User {
    id: string
    username: string
    discriminator?: string | null
    globalName?: string | null
    avatar: string | null
    email?: string
    isDeveloper?: boolean
}

export interface AuthStatus {
    authenticated: boolean
    user?: User
}
