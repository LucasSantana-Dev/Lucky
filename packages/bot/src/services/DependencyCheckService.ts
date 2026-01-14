import { exec } from 'child_process'
import { promisify } from 'util'
import { infoLog, errorLog, debugLog } from '@lukbot/shared/utils'
import { sendDependencyWebhook } from '../utils/dependency/webhook'
import type { DependencyUpdate } from '../utils/dependency/types'

const execAsync = promisify(exec)

const CHECK_INTERVAL = parseInt(
    process.env.DEPENDENCY_CHECK_INTERVAL ?? '86400000',
)
const NOTIFY_ONLY_SECURITY =
    process.env.DEPENDENCY_NOTIFY_ONLY_SECURITY === 'true'

class DependencyCheckService {
    private intervalId: ReturnType<typeof setInterval> | null = null
    private lastCheckTime: number = 0
    private lastResults: DependencyUpdate[] = []

    start(): void {
        if (this.intervalId) {
            debugLog({ message: 'Dependency checker already running' })
            return
        }

        infoLog({
            message: `Starting dependency checker (interval: ${CHECK_INTERVAL}ms)`,
        })

        this.checkDependencies()

        this.intervalId = setInterval(() => {
            this.checkDependencies()
        }, CHECK_INTERVAL)
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            infoLog({ message: 'Dependency checker stopped' })
        }
    }

    async checkDependencies(): Promise<void> {
        try {
            debugLog({ message: 'Checking for dependency updates...' })

            const { stdout } = await execAsync('npx npm-check-updates --json')
            const updates = JSON.parse(stdout) as Record<string, string>

            const dependencyUpdates = this.parseUpdates(updates)

            if (dependencyUpdates.length === 0) {
                debugLog({ message: 'No dependency updates found' })
                return
            }

            const filteredUpdates = NOTIFY_ONLY_SECURITY
                ? dependencyUpdates.filter((update) => update.isSecurity)
                : dependencyUpdates

            if (filteredUpdates.length === 0) {
                debugLog({
                    message: 'No security updates found (security-only mode)',
                })
                return
            }

            const hasNewUpdates = this.hasNewUpdates(filteredUpdates)

            if (hasNewUpdates) {
                await sendDependencyWebhook(filteredUpdates)
                this.lastResults = filteredUpdates
                this.lastCheckTime = Date.now()
                infoLog({
                    message: `Sent dependency update notification for ${filteredUpdates.length} packages`,
                })
            } else {
                debugLog({
                    message: 'No new updates since last check',
                })
            }
        } catch (error) {
            errorLog({ message: 'Error checking dependencies:', error })
        }
    }

    private parseUpdates(
        updates: Record<string, string>,
    ): DependencyUpdate[] {
        const result: DependencyUpdate[] = []

        for (const [packageName, latestVersion] of Object.entries(updates)) {
            const currentVersion = this.getCurrentVersion(packageName)
            if (!currentVersion) continue

            const updateType = this.determineUpdateType(
                currentVersion,
                latestVersion,
            )

            result.push({
                packageName,
                currentVersion,
                latestVersion,
                updateType,
                isSecurity: this.isSecurityUpdate(packageName, updateType),
            })
        }

        return result.sort((a, b) => {
            if (a.isSecurity && !b.isSecurity) return -1
            if (!a.isSecurity && b.isSecurity) return 1
            if (a.updateType === 'major' && b.updateType !== 'major') return -1
            if (a.updateType !== 'major' && b.updateType === 'major') return 1
            return 0
        })
    }

    private getCurrentVersion(packageName: string): string | null {
        try {
            type PackageJson = {
                dependencies?: Record<string, string>
                devDependencies?: Record<string, string>
            }
            const packageJson = require('../../package.json') as PackageJson
            const deps: Record<string, string> = {
                ...(packageJson.dependencies ?? {}),
                ...(packageJson.devDependencies ?? {}),
            }
            const version = deps[packageName]
            return version ? version.replace(/[\^~]/, '') : null
        } catch {
            return null
        }
    }

    private determineUpdateType(
        current: string,
        latest: string,
    ): 'major' | 'minor' | 'patch' | 'security' {
        const currentParts = current.split('.').map(Number)
        const latestParts = latest.split('.').map(Number)

        if (latestParts[0] > currentParts[0]) return 'major'
        if (latestParts[1] > currentParts[1]) return 'minor'
        if (latestParts[2] > currentParts[2]) return 'patch'
        return 'patch'
    }

    private isSecurityUpdate(
        _packageName: string,
        updateType: string,
    ): boolean {
        return updateType === 'major' || updateType === 'security'
    }

    private hasNewUpdates(updates: DependencyUpdate[]): boolean {
        if (this.lastResults.length === 0) return true

        const lastPackageNames = new Set(
            this.lastResults.map((u) => u.packageName),
        )
        const currentPackageNames = new Set(
            updates.map((u) => u.packageName),
        )

        if (currentPackageNames.size !== lastPackageNames.size) return true

        for (const update of updates) {
            const lastUpdate = this.lastResults.find(
                (u) => u.packageName === update.packageName,
            )
            if (!lastUpdate || lastUpdate.latestVersion !== update.latestVersion) {
                return true
            }
        }

        return false
    }

    getLastCheckTime(): number {
        return this.lastCheckTime
    }

    getLastResults(): DependencyUpdate[] {
        return [...this.lastResults]
    }
}

export const dependencyCheckService = new DependencyCheckService()
