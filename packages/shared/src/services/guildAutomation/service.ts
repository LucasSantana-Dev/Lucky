import { getPrismaClient } from '../../utils/database/prismaClient.js'
import { errorLog, debugLog } from '../../utils/general/log.js'
import {
    guildAutomationManifestSchema,
    type GuildAutomationManifestInput,
} from './manifestSchema.js'
import { GuildAutomationRepository } from './GuildAutomationRepository.js'
import { GuildAutomationOrchestrator } from './GuildAutomationOrchestrator.js'

const prisma = getPrismaClient()
const repository = new GuildAutomationRepository(prisma)

export const guildAutomationService = new GuildAutomationOrchestrator(
    repository,
)

export type { GuildAutomationManifestDocument } from './types.js'

export function validateManifestOrThrow(
    manifest: unknown,
): GuildAutomationManifestInput {
    return guildAutomationManifestSchema.parse(manifest)
}

export function parseManifestForDiff(
    manifest: unknown,
): ReturnType<typeof guildAutomationManifestSchema.parse> {
    if (
        typeof manifest !== 'object' ||
        manifest === null ||
        Array.isArray(manifest)
    ) {
        throw new Error('Manifest payload is invalid')
    }

    return guildAutomationManifestSchema.parse(manifest)
}

export async function createAutomationPlanWithDefaults(params: {
    guildId: string
    desired: ReturnType<typeof guildAutomationManifestSchema.parse>
    actual: ReturnType<typeof guildAutomationManifestSchema.parse>
}) {
    try {
        debugLog({
            message:
                'Creating automation plan from explicit desired/actual state',
            data: { guildId: params.guildId },
        })

        const { createAutomationPlan } = await import('./diff.js')
        const plan = createAutomationPlan({
            desired: params.desired,
            actual: params.actual,
        })

        return plan
    } catch (error) {
        errorLog({
            message: 'Failed to create automation plan',
            error,
        })
        throw error
    }
}
