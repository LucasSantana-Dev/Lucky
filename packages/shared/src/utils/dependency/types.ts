export type DependencyUpdate = {
    packageName: string
    currentVersion: string
    latestVersion: string
    updateType: 'major' | 'minor' | 'patch' | 'security'
    isSecurity: boolean
}
