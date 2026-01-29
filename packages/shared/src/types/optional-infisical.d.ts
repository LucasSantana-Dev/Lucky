declare module '@infisical/sdk' {
  export class InfisicalSDK {
    constructor(options?: { siteUrl?: string })
    auth(): { universalAuth: { login: (opts: { clientId: string; clientSecret: string }) => Promise<void> } }
    secrets(): {
      listSecrets(opts: {
        projectId: string
        environment: string
        secretPath?: string
        expandSecretReferences?: boolean
        viewSecretValue?: boolean
        includeImports?: boolean
      }): Promise<{ secrets?: Array<{ secretKey: string; secretValue?: string | null }> }>
    }
  }
}
