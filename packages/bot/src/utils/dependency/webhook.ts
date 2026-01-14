import { errorLog, debugLog } from '@lukbot/shared/utils'
import type { DependencyUpdate } from './types'

const WEBHOOK_URL = process.env.DEPENDENCY_WEBHOOK_URL

export async function sendDependencyWebhook(
    updates: DependencyUpdate[],
): Promise<boolean> {
    if (!WEBHOOK_URL) {
        debugLog({ message: 'Dependency webhook URL not configured' })
        return false
    }

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [
                    {
                        title: 'Dependency Updates Available',
                        description: `Found ${updates.length} package update(s)`,
                        color: 0xff9900,
                        fields: updates.map((update) => ({
                            name: update.packageName,
                            value: `${update.currentVersion} → ${update.latestVersion}`,
                            inline: true,
                        })),
                        timestamp: new Date().toISOString(),
                    },
                ],
            }),
        })

        if (!response.ok) {
            errorLog({
                message: `Failed to send dependency webhook: ${response.statusText}`,
            })
            return false
        }

        debugLog({ message: 'Dependency webhook sent successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error sending dependency webhook:', error })
        return false
    }
}
