export interface Guild {
  id: string
  name: string
  icon: string | null
  owner: boolean
  permissions: string
  features: string[]
  hasBot: boolean
  botInviteUrl?: string
}
