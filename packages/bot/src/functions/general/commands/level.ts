import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits, ChannelType } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../../../utils/general/embeds'
import { buildUserProfileEmbed, buildListPageEmbed } from '../../../utils/general/responseEmbeds'
import { errorLog } from '@lucky/shared/utils'
import { createUserFriendlyError } from '../../../utils/general/errorSanitizer'
import { levelService, xpNeededForLevel } from '@lucky/shared/services'
import { createLeaderboardPaginationButtons } from '../../../utils/music/buttonComponents'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('XP and level system')
        .addSubcommand((sub) =>
            sub
                .setName('rank')
                .setDescription('Show your rank or another user\'s rank')
                .addUserOption((o) =>
                    o.setName('user').setDescription('User to check').setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('leaderboard').setDescription('Show the XP leaderboard'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('setup')
                .setDescription('Configure the level system')
                .addIntegerOption((o) =>
                    o
                        .setName('xp-per-message')
                        .setDescription('XP awarded per message (default: 15)')
                        .setMinValue(1)
                        .setRequired(true),
                )
                .addIntegerOption((o) =>
                    o
                        .setName('cooldown-seconds')
                        .setDescription('Cooldown between XP awards in seconds (default: 60)')
                        .setMinValue(1)
                        .setRequired(true),
                )
                .addChannelOption((o) =>
                    o
                        .setName('announce-channel')
                        .setDescription('Channel to announce level-ups')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('reward')
                .setDescription('Manage level rewards')
                .addSubcommand((sub) =>
                    sub
                        .setName('add')
                        .setDescription('Add a role reward for reaching a level')
                        .addIntegerOption((o) =>
                            o.setName('level').setDescription('Level required').setMinValue(1).setRequired(true),
                        )
                        .addRoleOption((o) =>
                            o.setName('role').setDescription('Role to grant').setRequired(true),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a role reward for a level')
                        .addIntegerOption((o) =>
                            o.setName('level').setDescription('Level to remove reward from').setMinValue(1).setRequired(true),
                        ),
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'general',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return
        if (!interaction.guild) return

        const subcommandGroup = interaction.options.getSubcommandGroup(false)
        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommandGroup === 'reward') {
                if (subcommand === 'add') {
                    const level = interaction.options.getInteger('level', true)
                    const role = interaction.options.getRole('role', true)
                    await levelService.addReward(interaction.guild.id, level, role.id)
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createSuccessEmbed(
                                    'Reward Added',
                                    `${role} will be granted when reaching level **${level}**.`,
                                ),
                            ],
                        },
                    })
                } else if (subcommand === 'remove') {
                    const level = interaction.options.getInteger('level', true)
                    await levelService.removeReward(interaction.guild.id, level)
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [createSuccessEmbed('Reward Removed', `Reward for level **${level}** removed.`)],
                        },
                    })
                }
                return
            }

            if (subcommand === 'rank') {
                const targetUser = interaction.options.getUser('user') ?? interaction.user
                const guildId = interaction.guild.id
                const xpData = await levelService.getMemberXP(guildId, targetUser.id)
                const rank = await levelService.getRank(guildId, targetUser.id)

                const xp = xpData?.xp ?? 0
                const level = xpData?.level ?? 0
                const xpNeeded = xpNeededForLevel(level + 1)

                const embed = buildUserProfileEmbed(targetUser, {
                    level,
                    rank,
                    xp,
                    xpForNextLevel: xpNeeded,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [embed],
                    },
                })
            } else if (subcommand === 'leaderboard') {
                const entries = await levelService.getLeaderboard(interaction.guild.id, 50)

                if (entries.length === 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [createInfoEmbed('Leaderboard', 'No XP recorded yet.')],
                        },
                    })
                    return
                }

                const listItems = entries.map(
                    (e: { userId: string; level: number; xp: number }, i: number) => ({
                        name: `#${i + 1}`,
                        value: `<@${e.userId}> — Level ${e.level} (${e.xp} XP)`,
                    }),
                )

                const itemsPerPage = 5
                const totalPages = Math.ceil(listItems.length / itemsPerPage)
                const currentPage = 0

                const embed = buildListPageEmbed(listItems, currentPage + 1, {
                    title: 'XP Leaderboard',
                    itemsPerPage,
                })

                const components = []
                const paginationRow = createLeaderboardPaginationButtons(currentPage, totalPages)
                if (paginationRow) {
                    components.push(paginationRow)
                }

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [embed],
                        components,
                    },
                })
            } else if (subcommand === 'setup') {
                const xpPerMessage = interaction.options.getInteger('xp-per-message', true)
                const cooldownSeconds = interaction.options.getInteger('cooldown-seconds', true)
                const announceChannel = interaction.options.getChannel('announce-channel')

                await levelService.upsertConfig(interaction.guild.id, {
                    xpPerMessage,
                    xpCooldownMs: cooldownSeconds * 1000,
                    announceChannel: announceChannel?.id ?? null,
                })

                const lines = [
                    `**XP per message:** ${xpPerMessage}`,
                    `**Cooldown:** ${cooldownSeconds}s`,
                    announceChannel ? `**Announce channel:** ${announceChannel}` : '**Announce channel:** None',
                ]

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [createSuccessEmbed('Level System Configured', lines.join('\n'))],
                    },
                })
            }
        } catch (error) {
            errorLog({ message: 'Error in level command:', error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            createUserFriendlyError(error),
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
