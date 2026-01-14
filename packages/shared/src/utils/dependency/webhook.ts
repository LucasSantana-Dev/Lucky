import { errorLog, debugLog } from '../general/log'
import type { DependencyUpdate } from './types'

const WEBHOOK_URL = process.env.DEPENDENCY_WEBHOOK_URL

export async function sendDependencyWebhook(
    updates: DependencyUpdate[],
): Promise<void> {
    if (!WEBHOOK_URL) {
        debugLog({
            message: 'Dependency webhook URL not configured, skipping notification',
        })
        return
    }

    try {
        const securityUpdates = updates.filter((u) => u.isSecurity)
        const majorUpdates = updates.filter((u) => u.updateType === 'major')
        const minorUpdates = updates.filter((u) => u.updateType === 'minor')
        const patchUpdates = updates.filter((u) => u.updateType === 'patch')

        const fields = []

        if (securityUpdates.length > 0) {
            fields.push({
                name: '🔒 Security Updates',
                value: securityUpdates
                    .slice(0, 10)
                    .map(
                        (u) =>
                            `**${u.packageName}**: ${u.currentVersion} → ${u.latestVersion}`,
                    )
                    .join('\n'),
                inline: false,
            })
        }

        if (majorUpdates.length > 0) {
            fields.push({
                name: '⚠️ Major Updates',
                value: majorUpdates
                    .slice(0, 10)
                    .map(
                        (u) =>
                            `**${u.packageName}**: ${u.currentVersion} → ${u.latestVersion}`,
                    )
                    .join('\n'),
                inline: false,
            })
        }

        if (minorUpdates.length > 0) {
            fields.push({
                name: '📦 Minor Updates',
                value: minorUpdates
                    .slice(0, 10)
                    .map(
                        (u) =>
                            `**${u.packageName}**: ${u.currentVersion} → ${u.latestVersion}`,
                    )
                    .join('\n'),
                inline: false,
            })
        }

        if (patchUpdates.length > 0) {
            fields.push({
                name: '🔧 Patch Updates',
                value: patchUpdates
                    .slice(0, 10)
                    .map(
                        (u) =>
                            `**${u.packageName}**: ${u.currentVersion} → ${u.latestVersion}`,
                    )
                    .join('\n'),
                inline: false,
            })
        }

        const embed = {
            title: '📦 Dependency Updates Available',
            description: `Found ${updates.length} package update(s) available`,
            color: securityUpdates.length > 0 ? 0xff0000 : 0x5865f2,
            fields,
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Run `npm run check:outdated` to see all updates',
            },
        }

        const payload = {
            embeds: [embed],
        }

        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            throw new Error(`Webhook request failed: ${response.statusText}`)
        }

        debugLog({
            message: `Successfully sent dependency update notification`,
        })
    } catch (error) {
        errorLog({
            message: 'Failed to send dependency update webhook:',
            error,
        })
    }
}
