#!/usr/bin/env node
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DependencyUpdate } from '../src/utils/dependency/types'

const execAsync = promisify(exec)

const NOTIFY_ONLY_SECURITY =
    process.env.DEPENDENCY_NOTIFY_ONLY_SECURITY === 'true'

interface PackageJson {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
}

function getCurrentVersion(
    packageName: string,
    packageJson: PackageJson,
): string | null {
    const deps: Record<string, string> = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
    }
    const version = deps[packageName]
    return version ? version.replace(/[\^~]/, '') : null
}

function determineUpdateType(
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

function isSecurityUpdate(
    _packageName: string,
    updateType: string,
): boolean {
    return updateType === 'major' || updateType === 'security'
}

function parseUpdates(
    updates: Record<string, string>,
    packageJson: PackageJson,
): DependencyUpdate[] {
    const result: DependencyUpdate[] = []

    for (const [packageName, latestVersion] of Object.entries(updates)) {
        const currentVersion = getCurrentVersion(packageName, packageJson)
        if (!currentVersion) continue

        const updateType = determineUpdateType(currentVersion, latestVersion)

        result.push({
            packageName,
            currentVersion,
            latestVersion,
            updateType,
            isSecurity: isSecurityUpdate(packageName, updateType),
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

async function checkDependencies(): Promise<void> {
    try {
        console.log('Checking for dependency updates...')

        const packageJsonPath = join(process.cwd(), 'package.json')
        const packageJson = JSON.parse(
            readFileSync(packageJsonPath, 'utf-8'),
        ) as PackageJson

        const { stdout } = await execAsync('npx npm-check-updates --json')
        const updates = JSON.parse(stdout) as Record<string, string>

        const dependencyUpdates = parseUpdates(updates, packageJson)

        if (dependencyUpdates.length === 0) {
            console.log('✅ No dependency updates found')
            return
        }

        const filteredUpdates = NOTIFY_ONLY_SECURITY
            ? dependencyUpdates.filter((update) => update.isSecurity)
            : dependencyUpdates

        if (filteredUpdates.length === 0) {
            console.log('ℹ️  No security updates found (security-only mode)')
            return
        }

        console.log(`\n📦 Found ${filteredUpdates.length} update(s):\n`)
        filteredUpdates.forEach((update) => {
            const icon = update.isSecurity ? '🔒' : '📦'
            console.log(
                `${icon} ${update.packageName}: ${update.currentVersion} → ${update.latestVersion} (${update.updateType})`,
            )
        })

        const outputPath = join(process.cwd(), 'dependency-updates.json')
        writeFileSync(
            outputPath,
            JSON.stringify(filteredUpdates, null, 2),
            'utf-8',
        )
        console.log(`\n💾 Results saved to: ${outputPath}`)

        process.exit(0)
    } catch (error) {
        console.error('❌ Error checking dependencies:', error)
        process.exit(1)
    }
}

checkDependencies()
