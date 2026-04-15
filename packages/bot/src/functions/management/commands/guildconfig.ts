import { COLOR } from '@lucky/shared/constants'
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command'
import { guildAutomationService } from '@lucky/shared/services'
import { interactionReply } from '../../../utils/general/interactionReply'
import { captureGuildAutomationState } from '../../../utils/guildAutomation/captureGuildState'
import { applyAutomationModules } from '../../../utils/guildAutomation/applyPlan'
import { errorLog } from '@lucky/shared/utils'

function summaryEmbed(params: {
    title: string
    guildName: string
    description: string
    fields?: Array<{ name: string; value: string; inline?: boolean }>
    color?: number
}) {
    const embed = new EmbedBuilder()
        .setTitle(params.title)
        .setDescription(params.description)
        .setColor(params.color ?? COLOR.SETUP_PURPLE)
        .setFooter({ text: params.guildName })
        .setTimestamp()

    if (params.fields && params.fields.length > 0) {
        embed.addFields(params.fields)
    }

    return embed
}

function runSummaryText(plan: {
    summary: { total: number; safe: number; protected: number }
}) {
    return `Total: ${plan.summary.total} • Safe: ${plan.summary.safe} • Protected: ${plan.summary.protected}`
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('guildconfig')
        .setDescription('Centralized guild automation (manifest + reconcile)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) =>
            sub
                .setName('capture')
                .setDescription(
                    'Capture current guild state into automation snapshot',
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('plan')
                .setDescription(
                    'Generate drift plan from manifest against current guild state',
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('apply')
                .setDescription(
                    'Apply safe drift operations to current guild state',
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName('allow_protected')
                        .setDescription(
                            'Allow protected deletes/permission-tightening operations',
                        )
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('reconcile')
                .setDescription('Capture, plan, and apply state reconciliation')
                .addBooleanOption((opt) =>
                    opt
                        .setName('allow_protected')
                        .setDescription(
                            'Allow protected deletes/permission-tightening operations',
                        )
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('status')
                .setDescription('Show latest manifest, run, and drift status'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('cutover')
                .setDescription(
                    'Finalize parity checklist and mark legacy-bot cutover',
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName('complete_checklist')
                        .setDescription(
                            'Force-complete checklist and mark cutover ready',
                        )
                        .setRequired(false),
                ),
        ),
    category: 'management',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interaction.reply({
                content: '❌ This command can only be used in a server.',
                ephemeral: true,
            })
            return
        }

        await interaction.deferReply({ ephemeral: true })

        const guild = interaction.guild
        const subcommand = interaction.options.getSubcommand(true)

        try {
            if (subcommand === 'capture') {
                const capture = await captureGuildAutomationState(
                    guild,
                    interaction.client.user?.id,
                )
                const result = await guildAutomationService.recordCapture(
                    guild.id,
                    capture,
                    interaction.user.id,
                )

                await interaction.editReply({
                    embeds: [
                        summaryEmbed({
                            title: '✅ Guild State Captured',
                            guildName: guild.name,
                            description:
                                'Current Discord state was captured for shadow planning.',
                            fields: [
                                {
                                    name: 'Run',
                                    value: result.runId,
                                    inline: true,
                                },
                            ],
                            color: COLOR.INFO_GREEN,
                        }),
                    ],
                })
                return
            }

            if (subcommand === 'plan') {
                const current = await captureGuildAutomationState(
                    guild,
                    interaction.client.user?.id,
                )
                const result = await guildAutomationService.createPlan(
                    guild.id,
                    {
                        actualState: current,
                        initiatedBy: interaction.user.id,
                        runType: 'plan',
                    },
                )

                await interaction.editReply({
                    embeds: [
                        summaryEmbed({
                            title: '📋 Drift Plan',
                            guildName: guild.name,
                            description: runSummaryText(result.plan),
                            fields: [
                                {
                                    name: 'Run',
                                    value: result.runId,
                                    inline: true,
                                },
                                {
                                    name: 'Protected Ops',
                                    value: String(
                                        result.plan.protectedOperations.length,
                                    ),
                                    inline: true,
                                },
                            ],
                        }),
                    ],
                })
                return
            }

            if (subcommand === 'apply' || subcommand === 'reconcile') {
                const allowProtected =
                    interaction.options.getBoolean('allow_protected') ?? false
                const current = await captureGuildAutomationState(
                    guild,
                    interaction.client.user?.id,
                )

                const planResult = await guildAutomationService.createPlan(
                    guild.id,
                    {
                        actualState: current,
                        initiatedBy: interaction.user.id,
                        runType: subcommand,
                    },
                )

                const blockedByProtected =
                    !allowProtected &&
                    planResult.plan.protectedOperations.length > 0

                let applyDiagnostics: Record<string, unknown> = {
                    allowProtected,
                    blockedByProtected,
                }

                if (!blockedByProtected) {
                    const applyResult = await applyAutomationModules({
                        guild,
                        desired: planResult.desired,
                        plan: planResult.plan,
                        allowProtected,
                    })

                    applyDiagnostics = {
                        ...applyDiagnostics,
                        appliedModules: applyResult.appliedModules,
                        skippedModules: applyResult.skippedModules,
                    }

                    await guildAutomationService.updateRunStatus({
                        runId: planResult.runId,
                        status: 'completed',
                        diagnostics: applyDiagnostics,
                    })
                } else {
                    await guildAutomationService.updateRunStatus({
                        runId: planResult.runId,
                        status: 'blocked',
                        diagnostics: applyDiagnostics,
                    })
                }

                await interaction.editReply({
                    embeds: [
                        summaryEmbed({
                            title:
                                subcommand === 'apply'
                                    ? '⚙️ Apply Result'
                                    : '🔁 Reconcile Result',
                            guildName: guild.name,
                            description: blockedByProtected
                                ? `Blocked by protected operations. ${runSummaryText(planResult.plan)}`
                                : `Applied safe operations. ${runSummaryText(planResult.plan)}`,
                            fields: [
                                {
                                    name: 'Run',
                                    value: planResult.runId,
                                    inline: true,
                                },
                                {
                                    name: 'Allow Protected',
                                    value: String(allowProtected),
                                    inline: true,
                                },
                            ],
                            color: blockedByProtected ? 0xf59e0b : COLOR.INFO_GREEN,
                        }),
                    ],
                })

                return
            }

            if (subcommand === 'status') {
                const status = await guildAutomationService.getStatus(guild.id)
                const runs = await guildAutomationService.listRuns(guild.id, 5)

                await interaction.editReply({
                    embeds: [
                        summaryEmbed({
                            title: '📊 Guild Automation Status',
                            guildName: guild.name,
                            description: status.manifest
                                ? `Manifest v${status.manifest.version} available.`
                                : 'No manifest found yet.',
                            fields: [
                                {
                                    name: 'Latest Run',
                                    value: status.latestRun
                                        ? `${status.latestRun.type} • ${status.latestRun.status}`
                                        : 'none',
                                    inline: true,
                                },
                                {
                                    name: 'Drift Modules',
                                    value:
                                        status.drifts.length > 0
                                            ? status.drifts
                                                  .map(
                                                      (drift) =>
                                                          `${drift.module}:${drift.severity}`,
                                                  )
                                                  .join(', ')
                                            : 'none',
                                },
                                {
                                    name: 'Recent Runs',
                                    value:
                                        runs.length > 0
                                            ? runs
                                                  .map(
                                                      (run) =>
                                                          `${run.type}:${run.status}`,
                                                  )
                                                  .join(' | ')
                                            : 'none',
                                },
                            ],
                        }),
                    ],
                })
                return
            }

            if (subcommand === 'cutover') {
                const completeChecklist =
                    interaction.options.getBoolean('complete_checklist') ??
                    false
                const result = await guildAutomationService.runCutover(
                    guild.id,
                    {
                        initiatedBy: interaction.user.id,
                        completeChecklist,
                    },
                )

                let cleanedBots = 0
                if (result.status === 'completed') {
                    const manifest = await guildAutomationService.getManifest(
                        guild.id,
                    )
                    const externalBots =
                        manifest?.manifest.parity?.externalBots ?? []

                    for (const bot of externalBots) {
                        const member = guild.members.cache.get(bot.id)
                        if (!member) {
                            continue
                        }

                        const removableRoleIds = [
                            ...member.roles.cache.values(),
                        ]
                            .filter((role) => role.id !== guild.id)
                            .map((role) => role.id)

                        if (removableRoleIds.length === 0) {
                            continue
                        }

                        await member.roles.remove(
                            removableRoleIds,
                            'Lucky cutover removed legacy bot permissions',
                        )
                        cleanedBots += 1
                    }
                }

                await interaction.editReply({
                    embeds: [
                        summaryEmbed({
                            title: '🚀 Cutover Status',
                            guildName: guild.name,
                            description:
                                result.status === 'completed'
                                    ? 'Cutover is now marked ready. Legacy-bot ownership can be removed.'
                                    : 'Cutover blocked. Complete parity checklist first.',
                            fields: [
                                {
                                    name: 'Run',
                                    value: result.runId,
                                    inline: true,
                                },
                                {
                                    name: 'Checklist Complete',
                                    value: String(result.checklistComplete),
                                    inline: true,
                                },
                                {
                                    name: 'Legacy Bots Cleaned',
                                    value: String(cleanedBots),
                                    inline: true,
                                },
                            ],
                            color:
                                result.status === 'completed'
                                    ? COLOR.INFO_GREEN
                                    : 0xf59e0b,
                        }),
                    ],
                })
            }
        } catch (error) {
            errorLog({
                message: 'guildconfig command failed',
                error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        error instanceof Error
                            ? `❌ ${error.message}`
                            : '❌ Failed to execute guild automation command.',
                    ephemeral: true,
                },
            })
        }
    },
})
