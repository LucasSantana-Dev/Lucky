import { z } from 'zod'

const snowflake = z.string().regex(/^\d{17,20}$/)

const onboardingPromptOptionSchema = z.object({
    id: snowflake.optional(),
    title: z.string().min(1).max(100),
    description: z.string().max(200).nullable().optional(),
    channelIds: z.array(snowflake).optional(),
    roleIds: z.array(snowflake).optional(),
    emoji: z.string().max(100).nullable().optional(),
})

const onboardingPromptSchema = z.object({
    id: snowflake.optional(),
    title: z.string().min(1).max(100),
    singleSelect: z.boolean().optional(),
    required: z.boolean().optional(),
    inOnboarding: z.boolean().optional(),
    type: z.number().int().min(0).max(3).optional(),
    options: z.array(onboardingPromptOptionSchema).max(25),
})

const onboardingSchema = z.object({
    enabled: z.boolean(),
    mode: z.number().int().min(0).max(1),
    defaultChannelIds: z.array(snowflake).max(50),
    prompts: z.array(onboardingPromptSchema).max(20),
})

const roleSchema = z.object({
    id: snowflake,
    name: z.string().min(1).max(100),
    color: z.number().int().min(0).max(0xffffff).optional(),
    hoist: z.boolean().optional(),
    mentionable: z.boolean().optional(),
    permissions: z.string().optional(),
})

const channelSchema = z.object({
    id: snowflake,
    name: z.string().min(1).max(100),
    type: z.string().min(1).max(32),
    parentId: snowflake.nullable().optional(),
    topic: z.string().max(1024).nullable().optional(),
    readonly: z.boolean().optional(),
})

const automessageSchema = z.object({
    enabled: z.boolean().optional(),
    channelId: snowflake.optional(),
    message: z.string().max(2000).optional(),
})

const reactionRoleSchema = z.object({
    roleId: snowflake,
    label: z.string().min(1).max(80),
    emoji: z.string().max(100).optional(),
    style: z.string().max(20).optional(),
})

const reactionRoleMessageSchema = z.object({
    id: z.string().max(100).optional(),
    messageId: snowflake.optional(),
    channelId: snowflake.optional(),
    title: z.string().max(256).optional(),
    description: z.string().max(4000).optional(),
    mappings: z.array(reactionRoleSchema).max(25).optional(),
})

const moduleGrantSchema = z.object({
    roleId: snowflake,
    module: z.enum([
        'overview',
        'settings',
        'moderation',
        'automation',
        'music',
        'integrations',
    ]),
    mode: z.enum(['view', 'manage']),
})

const paritySchema = z.object({
    shadowMode: z.boolean().optional(),
    externalBots: z
        .array(
            z.object({
                id: snowflake,
                name: z.string().min(1).max(100),
            }),
        )
        .optional(),
    checklist: z
        .array(
            z.object({
                key: z.string().min(1).max(100),
                label: z.string().min(1).max(160),
                done: z.boolean(),
            }),
        )
        .optional(),
    cutoverReady: z.boolean().optional(),
})

export const guildAutomationManifestSchema = z
    .object({
        version: z.number().int().min(1).max(100),
        guild: z.object({
            id: snowflake,
            name: z.string().max(100).optional(),
        }),
        onboarding: onboardingSchema.optional(),
        roles: z
            .object({
                roles: z.array(roleSchema).max(500),
                channels: z.array(channelSchema).max(1000),
            })
            .optional(),
        moderation: z
            .object({
                automod: z.record(z.string(), z.unknown()).optional(),
                moderationSettings: z
                    .record(z.string(), z.unknown())
                    .optional(),
            })
            .optional(),
        automessages: z
            .object({
                welcome: automessageSchema.optional(),
                leave: automessageSchema.optional(),
            })
            .optional(),
        reactionroles: z
            .object({
                messages: z.array(reactionRoleMessageSchema).optional(),
                exclusiveRoles: z
                    .array(
                        z.object({
                            roleId: snowflake,
                            excludedRoleId: snowflake,
                        }),
                    )
                    .optional(),
            })
            .optional(),
        commandaccess: z
            .object({
                grants: z.array(moduleGrantSchema),
            })
            .optional(),
        parity: paritySchema.optional(),
        source: z.enum(['discord-capture', 'manual']).optional(),
        capturedAt: z.string().datetime().optional(),
    })
    .strict()

export type GuildAutomationManifestInput = z.infer<
    typeof guildAutomationManifestSchema
>

export function validateGuildAutomationManifest(input: unknown) {
    return guildAutomationManifestSchema.parse(input)
}
